# Claude SDK 集成 — 架构设计

> 日期: 2026-04-07
> 目标: 以 Claude Agent SDK 替换 Vercel AI SDK 运行时，重构 harness 工程，支持 sub-agent、动态模板、参考资料系统

---

## 1. 总体架构

```
┌─────────────────────────────────────────────────────┐
│  Browser (React 19 + Next.js 15)                    │
│  @assistant-ui/react — 不变                          │
│  Transport 适配层 — Claude stream → AI SDK stream    │
└──────────────────────┬──────────────────────────────┘
                       │ POST /api/chat
                       ▼
┌─────────────────────────────────────────────────────┐
│  Route Handler (app/api/chat/route.ts)              │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Claude Agent SDK                             │  │
│  │                                               │  │
│  │  Orchestrator Agent                           │  │
│  │    ├─ handoff → ReqAnalyzer (需求分析)         │  │
│  │    ├─ handoff → DocGenerator (文档生成)        │  │
│  │    └─ handoff → TemplateSpecialist (模板修正)  │  │
│  │                                               │  │
│  │  Tools: workspace, reference, docx, mcp       │  │
│  │  Guardrails: permission policy                │  │
│  │  Hooks: audit, budget                         │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  WorkspaceFS ── LocalFS / SandboxFS                 │
└─────────────────────────────────────────────────────┘
```

### 核心原则

1. **后端替换，前端保持** — route handler 做 stream 格式转换，前端零改动
2. **Agent 只管内容，工具管操作** — 机械操作沉到工具内部
3. **代码优先，LLM 兜底** — 确定性逻辑不花 token

---

## 2. 运行时替换

### 2.1 删除的代码

| 文件 | 原职责 | 替代方案 |
|------|--------|----------|
| `lib/harness/agent-loop.ts` | 多步循环控制 | `Agent.run()` 内置 |
| `lib/harness/hooks.ts` | Hook 注册表 | Claude SDK `hooks` |
| `lib/harness/permissions.ts` | 权限策略 | Claude SDK `guardrails` |
| `lib/harness/context-budget.ts` | Token 预算 | Claude SDK 内置 token 管理 |
| `lib/harness/builtin-hooks.ts` | Risk/Audit/Budget hook | 映射到 SDK hooks |

### 2.2 保留的代码

| 文件 | 原因 |
|------|------|
| `lib/workspace/workspace-tools.ts` | 业务工具，改为调 WorkspaceFS 接口 |
| `lib/workspace/docx-tools.ts` | 业务工具，重构精简 |
| `lib/workspace/docx-support.ts` | 模板填充引擎，重构为 DOM 操作 |
| `lib/mcp.ts` | MCP 集成，适配 Claude SDK 的 tool 注册 |
| `lib/harness/runtime-capabilities.ts` | 工具组装，改为注册到 Agent |

### 2.3 Stream 适配层

Claude SDK 的事件流和 Vercel AI SDK 的 UI stream 格式不同。在 route handler 里做转换：

```typescript
// app/api/chat/route.ts
import { Agent } from "claude-agent-sdk";
import { toUIMessageStream } from "./stream-adapter";

export async function POST(req: Request) {
  const { messages, workspaceId, threadId } = await req.json();

  const result = await orchestrator.run(messages, { tools, hooks });

  // Claude SDK events → Vercel AI SDK UI stream
  return toUIMessageStream(result.stream, {
    sendReasoning: true,
    messageMetadata: { workspaceId, threadId },
  });
}
```

---

## 3. Multi-Agent 设计

### 3.1 Agent 定义

```typescript
const reqAnalyzer = new Agent({
  name: "ReqAnalyzer",
  instructions: "你是需求分析专家。分析用户输入，拆解为结构化需求...",
  tools: [read_reference, search_references],
});

const docGenerator = new Agent({
  name: "DocGenerator",
  instructions: "你是文档生成专家。根据结构化需求和模板 profile 生成内容...",
  tools: [read_reference, generate_document],
});

const templateSpecialist = new Agent({
  name: "TemplateSpecialist",
  instructions: "你是模板分析专家。当代码解析结果有误时，分析模板结构并修正 profile...",
  tools: [read_reference, update_template_profile],
});

const orchestrator = new Agent({
  name: "Orchestrator",
  instructions: "你是 ReqAgent 主控。根据用户意图分派任务...",
  handoffs: [reqAnalyzer, docGenerator, templateSpecialist],
  tools: [ingest_reference, read_reference, ...workspaceTools],
});
```

### 3.2 Handoff 流转

```
用户: "根据这些资料帮我写需求文档"

Orchestrator
  → ingest_reference (收录上传的资料)
  → handoff → ReqAnalyzer
      → read_reference (按需读取资料)
      → 返回结构化需求 JSON
  → handoff → DocGenerator
      → read_reference (补充细节)
      → generate_document (一次调用，内部分节+模板填充)
      → 返回 DOCX

用户: "第3章的识别好像不对"

Orchestrator
  → handoff → TemplateSpecialist
      → read_reference (看模板原始结构)
      → update_template_profile (修正 profile)
  → handoff → DocGenerator (用修正后的 profile 重新生成)
```

---

## 4. WorkspaceFS 抽象

### 4.1 接口

```typescript
interface WorkspaceFS {
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Buffer>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, data: Buffer): Promise<void>;
  list(dir: string): Promise<FSEntry[]>;
  stat(path: string): Promise<FSStatResult>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
}

interface FSEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modifiedAt: Date;
}
```

### 4.2 实现

```typescript
// 现在: 本地开发 / 单机部署
class LocalWorkspaceFS implements WorkspaceFS {
  constructor(private rootDir: string) {} // .reqagent/workspaces/{id}/
  async read(path) { return fs.readFile(resolve(this.rootDir, path), "utf8"); }
  // ...
}

// 将来: 云端部署
class SandboxWorkspaceFS implements WorkspaceFS {
  constructor(private sandboxId: string, private apiBase: string) {}
  async read(path) { return fetch(`${this.apiBase}/sandbox/${this.sandboxId}/fs/${path}`).then(r => r.text()); }
  // ...
}
```

### 4.3 迁移

当前 `workspace-tools.ts` 和 `docx-tools.ts` 中 30+ 处 `fs.*` 调用，统一改为：

```typescript
// Before
const content = await fs.readFile(resolved, "utf8");

// After
const content = await ctx.fs.read(resolved);
```

`ctx.fs` 通过 RuntimeContext 注入，工具代码不感知底层实现。

---

## 5. 参考资料系统

### 5.1 存储结构

```
.reqagent/workspaces/{id}/
  └── refs/
      ├── index.json          # 参考资料索引
      ├── ref_001/
      │   ├── meta.json       # 元信息（标题、格式、页数、sections）
      │   ├── content.json    # 解析后的结构化内容（按 section 分块）
      │   └── original.pdf    # 原始文件
      └── ref_002/
          ├── meta.json
          └── original.png    # 图片保留原文件，不做预处理
```

### 5.2 Tools

```typescript
// 收录参考资料 — 上传时调用
ingest_reference({
  file_path: string,           // workspace 内的路径
  title?: string,              // 可选，默认从文件名推断
})
→ {
  ref_id: string,
  title: string,
  format: "pdf" | "docx" | "xlsx" | "image" | "text",
  sections: string[],          // 章节标题列表
  summary: string,             // 自动摘要（前几段 / 首页）
  page_count?: number,
}

// 读取参考资料 — agent 按需调用
read_reference({
  ref_id: string,
  section?: string,            // 按章节名读取
  pages?: string,              // 按页码范围 "12-15"
  query?: string,              // 语义搜索（未来）
})
→ {
  content: string,             // 文本内容
  images?: ImagePart[],        // 图片直传给 vision
}

// 搜索参考资料 — 资料多时用
search_references({
  query: string,               // 自然语言查询
})
→ {
  results: { ref_id, title, section, relevance_snippet }[]
}
```

### 5.3 格式解析路由

```typescript
async function parseReference(filePath: string, fs: WorkspaceFS): Promise<ParsedReference> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".docx":
      return parseDocx(filePath, fs);     // 复用 analyzeDocxStructure
    case ".pdf":
      return parsePdf(filePath, fs);      // pdf-parse 提文字 + 分页
    case ".xlsx":
      return parseExcel(filePath, fs);    // xlsx → markdown tables
    case ".png": case ".jpg": case ".jpeg": case ".gif": case ".webp":
      return parseImage(filePath, fs);    // 存原图，meta only
    case ".md": case ".txt":
      return parseText(filePath, fs);     // 原样，按标题分 section
    default:
      return parseText(filePath, fs);     // fallback: 当纯文本处理
  }
}
```

### 5.4 System Prompt 注入

每次请求时，从 `index.json` 生成参考资料摘要注入 system prompt：

```
## 当前参考资料

| ID | 标题 | 格式 | 摘要 |
|----|------|------|------|
| ref_001 | 性能规范 | PDF (45页) | 定义系统性能基线，含响应时间、并发量、可用性要求 |
| ref_002 | 首页原型 | PNG | UI原型截图 |
| ref_003 | 现有接口文档 | DOCX | 12个REST API接口定义，含请求/响应schema |

使用 read_reference 工具按需读取具体内容。
```

---

## 6. DOCX 生成重构

### 6.1 新流程

```
旧流程 (agent 驱动 30+ 步):
  init_document → fill_section × 30 → finalize_document

新流程 (agent 只管内容):
  agent 输出完整 markdown → generate_document (单次调用，内部完成一切)
```

### 6.2 Tool 精简

```typescript
// 删除: init_document, fill_section, get_document_status, finalize_document
// 保留+重构:
parse_template({
  file_path: string,       // 用户上传的模板 .docx
})
→ {
  template_id: string,
  sections: {
    id: string,
    heading: string,
    level: number,
    content_type: "text" | "table" | "mixed",
    target_chars: number,
    is_placeholder: boolean,   // 代码启发式判断：是否需要替换
  }[],
  styles_snapshot: object,     // 格式快照供填充时继承
}

generate_document({
  markdown: string,            // agent 生成的完整内容
  template_id?: string,        // 可选，使用已解析的模板
  filename?: string,
})
→ {
  output_path: string,
  download_name: string,
  quality_report: QualityReport,
}
```

### 6.3 模板解析：代码优先 + LLM Skill 兜底

```
第一层 — 代码解析 (parse_template 内部):
  OOXML DOM 遍历
  ├─ <w:pStyle val="HeadingN"> → 标题
  ├─ <w:tbl> 首行 → 表头 schema
  ├─ 包含"请填写|此处|XXX|[  ]" → is_placeholder = true
  ├─ 段落字数 → target_chars
  └─ 输出 TemplateProfile

第二层 — 用户确认 (UI):
  "我识别出以下结构，请确认或修改"

第三层 — LLM 修正 (TemplateSpecialist agent):
  用户反馈"第3章识别错了"
  → handoff to TemplateSpecialist
  → 看原始 OOXML + 用户反馈
  → update_template_profile 修正
```

### 6.4 OOXML 操作升级

从正则替换迁移到结构化 DOM 操作：

```typescript
// Before: 正则替换（脆弱）
xml = xml.replace(/\{\{需求背景\}\}/g, escapeXml(content));

// After: DOM 操作（可靠）
import { parseStringPromise, Builder } from "xml2js";

async function fillTemplate(templateBuffer: Buffer, payload: Record<string, string>) {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docXml = await zip.file("word/document.xml")!.async("string");
  const doc = await parseStringPromise(docXml);

  // 遍历 body 的段落和表格节点
  walkParagraphs(doc, (paragraph, context) => {
    const text = extractText(paragraph);
    const sectionId = context.currentSection;

    if (payload[sectionId]) {
      // 替换内容，保留 paragraph 的 pPr (格式属性)
      replaceContent(paragraph, payload[sectionId]);
    }
  });

  const builder = new Builder();
  zip.file("word/document.xml", builder.buildObject(doc));
  return zip.generateAsync({ type: "nodebuffer" });
}
```

---

## 7. 实施计划

### Phase A: 基础替换 (核心)

1. 安装 Claude Agent SDK
2. 实现 WorkspaceFS 接口 + LocalWorkspaceFS
3. 迁移 workspace-tools.ts / docx-tools.ts 到 WorkspaceFS
4. 定义 Orchestrator agent（单 agent，无 handoff，功能等价现有）
5. 实现 stream 适配层（Claude SDK → Vercel AI SDK UI stream）
6. 删除 agent-loop.ts / hooks.ts / permissions.ts / context-budget.ts
7. 验证: 基本对话 + 工具调用正常

### Phase B: 参考资料系统

1. 实现 ingest_reference / read_reference / search_references tools
2. 实现格式解析路由（docx / pdf / image / text）
3. 实现 refs/ 存储 + index.json 管理
4. System prompt 注入参考资料摘要
5. 验证: 上传 PDF + 图片，agent 能按需引用

### Phase C: DOCX 重构

1. 实现 parse_template（代码解析 + 启发式规则）
2. 重构 generate_document（markdown → 模板填充，单次调用）
3. OOXML 操作从正则迁移到 DOM
4. 删除 init_document / fill_section / finalize_document
5. 验证: 用户上传模板 → 生成符合模板格式的文档

### Phase D: Multi-Agent

1. 拆分 ReqAnalyzer / DocGenerator / TemplateSpecialist
2. 配置 handoff 规则
3. 验证: 复杂需求文档场景走 multi-agent 流转

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Claude SDK stream 格式与前端不兼容 | Phase A 第5步专门做适配层，前端零改动 |
| OOXML DOM 操作比正则复杂 | 限定 Phase C，用 xml2js 而非手写 parser |
| MCP 工具注册方式不同 | Claude SDK 支持自定义 tool，MCP tool 包装为普通 tool 注册 |
| 用户上传的模板千奇百怪 | 代码解析 + 用户确认 + LLM 兜底三层保障 |
| `textutil` 快速路径在 Linux 不可用 | Phase C 统一走模板填充路径，移除 textutil 依赖 |
