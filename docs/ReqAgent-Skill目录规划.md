# ReqAgent — Skill 目录规划

## Skill 分类体系

```
Skill
├── 能力型 Skill（通用工具能力，可跨项目复用）
│   ├── 文档解析
│   ├── 图片/截图识别
│   ├── 网页抓取
│   ├── 文档生成/导出
│   ├── 图表生成
│   └── 搜索/检索
│
└── 知识型 Skill（领域知识，按项目组热插拔）
    ├── PRD 模板和规范
    ├── 行业合规要求
    ├── 历史项目参考
    ├── 领域术语表
    └── 评审 checklist
```

---

## 一、能力型 Skill（通用）

### 1. 文档解析 Skill

**场景**：用户上传 Word/PDF/Excel/PPT 作为需求输入素材，Agent 需要提取内容。

| 方案 | 包名 | 能力 | 推荐度 |
|------|------|------|--------|
| AWS Document Loader MCP | `awslabs.document-loader-mcp-server` | PDF/DOCX/XLSX/PPTX/图片，全格式 | ⭐⭐⭐⭐⭐ |
| PDF Reader MCP | `@sylphx/pdf-reader-mcp` | PDF 专精，并行处理，5-10x 快 | ⭐⭐⭐⭐ |
| Docling MCP | `docling-mcp` | PDF/Word，带 OCR，表格提取 | ⭐⭐⭐⭐ |
| MarkItDown | `markitdown` | 微软出品，Office → Markdown | ⭐⭐⭐ |

**推荐**：用 AWS Document Loader 作为主力，覆盖全格式。PDF 密集场景加 Sylphx PDF Reader。

**为什么不纯依赖 LLM API**：
- LLM 的 vision 能力可以读图片/截图，但对复杂表格、多页 PDF 效果差
- 专用解析器提取的是结构化文本，LLM 再分析准确率高很多
- 节省 token（先解析再喂给 LLM，比直接传 base64 图片便宜 10 倍）

```
用户上传 Word 文档
    │
    ▼
文档解析 Skill (MCP Server)
    │ 提取出 Markdown 结构化文本
    ▼
Agent 基于文本做需求分析（准确、省 token）

而不是：
用户上传 Word 文档
    │
    ▼
直接传给 LLM API（贵、不准、丢格式）
```

---

### 2. 图片/截图识别 Skill

**场景**：用户上传竞品截图、手绘草图、流程图照片，Agent 需要理解内容。

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| LLM Vision (GPT-4o/Claude) | 直接用模型的视觉能力 | ⭐⭐⭐⭐ |
| OCR MCP (PaddleOCR/Tesseract) | 纯文字提取，不理解语义 | ⭐⭐⭐ |
| Docling OCR MCP | OCR + 版面分析 | ⭐⭐⭐⭐ |

**推荐**：简单截图直接用 LLM Vision（GPT-4o 的视觉能力已经很强）。扫描件/传真件用 OCR MCP 预处理再喂给 LLM。

---

### 3. 网页抓取 Skill

**场景**：用户说"参考这个竞品网站"或"看看这个 API 文档"，Agent 需要抓取内容。

| 方案 | 包名 | 能力 | 推荐度 |
|------|------|------|--------|
| Fetch MCP (官方) | `@anthropic/mcp-fetch` | 简单网页抓取 → Markdown | ⭐⭐⭐⭐ |
| Playwright MCP | `@anthropic/mcp-playwright` | 浏览器操作，支持 JS 渲染页面 | ⭐⭐⭐⭐⭐ |
| Firecrawl MCP | `firecrawl-mcp` | 批量爬取+清洗 | ⭐⭐⭐ |

**推荐**：Playwright MCP，能处理现代 SPA 页面。

---

### 4. 文档生成/导出 Skill

**场景**：Agent 分析完需求后，输出 Word/PDF/Markdown 格式的 PRD。

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| Filesystem MCP + Markdown | 先输出 Markdown，用 pandoc 转 Word/PDF | ⭐⭐⭐⭐ |
| DOCX MCP Server | 直接生成 Word 文档 | ⭐⭐⭐ |
| 自建：模板填充 Tool | 读取 PRD 模板 → LLM 填充 → 输出文件 | ⭐⭐⭐⭐⭐ |

**推荐**：自建一个模板填充 Tool。因为你们有自己的 PRD 模板格式，通用的 DOCX 生成器不知道你们的格式。

```typescript
// 模板填充 Tool 示意
const fillPRDTemplate = tool({
  description: '基于 PRD 模板生成完整的需求文档',
  parameters: z.object({
    template_id: z.string().describe('PRD 模板 ID'),
    sections: z.record(z.string()).describe('各章节内容，key 为章节名'),
  }),
  execute: async ({ template_id, sections }) => {
    const template = await loadTemplate(template_id);
    const filled = applyTemplate(template, sections);
    const outputPath = await saveAsDocx(filled);
    return { path: outputPath, format: 'docx' };
  },
});
```

---

### 5. 图表生成 Skill

**场景**：Agent 需要输出用例图、数据流图、ER 图、流程图。

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| Mermaid（直接在 Markdown 里写） | Agent 输出 Mermaid 语法，前端渲染 | ⭐⭐⭐⭐⭐ |
| PlantUML MCP | 生成 UML 图 | ⭐⭐⭐ |
| 自建：Mermaid → SVG/PNG Tool | 服务端渲染为图片，嵌入文档 | ⭐⭐⭐⭐ |

**推荐**：直接让 Agent 输出 Mermaid 语法。前端用 mermaid.js 渲染，导出时转图片嵌入 Word。LLM 写 Mermaid 的能力已经很好了。

---

### 6. 搜索/检索 Skill

**场景**：Agent 需要搜索外部信息（竞品分析、技术方案）或内部知识库。

| 方案 | 说明 | 推荐度 |
|------|------|--------|
| Web Search (OpenAI 内置) | `streamText` 的 webSearch tool | ⭐⭐⭐⭐ |
| 自建：内部知识库检索 | 关键词/向量检索公司内部文档 | ⭐⭐⭐⭐⭐ |
| 自建：历史 PRD 检索 | 从历史项目的 PRD 中找相似需求 | ⭐⭐⭐⭐⭐ |

**推荐**：Web Search 用内置的。内部知识库自建（这是核心壁垒）。

---

## 二、知识型 Skill（按项目组热插拔）

这些 Skill 不是工具，而是**注入 Agent 大脑的知识**。

### 7. PRD 模板与规范 Skill

```
skill-prd-banking/
├── skill.json
│   {
│     "name": "银行零售业务 PRD 规范",
│     "domain": "banking-retail",
│     "version": "1.0"
│   }
├── prompt.md           ← 告诉 Agent 怎么写 PRD
│   "你在生成银行零售业务的 PRD 时，必须包含以下章节：
│    1. 业务背景与目标
│    2. 业务流程描述（含异常流程）
│    3. 功能需求（按子系统划分）
│    4. 非功能需求（性能/安全/合规/灾备）
│    5. 数据需求（数据字典/数据流向/数据分类分级）
│    6. 接口需求（内部系统对接/外部渠道对接）
│    7. 监管合规要求
│    8. 上线计划与灰度策略
│    ..."
├── knowledge/
│   ├── prd-template.md       ← 公司标准 PRD 模板
│   ├── writing-guide.md      ← PRD 撰写指南
│   └── review-checklist.md   ← PRD 评审要点
└── output-template.md        ← 输出格式要求
```

---

### 8. 合规知识 Skill

```
skill-compliance-finance/
├── skill.json
│   {
│     "name": "金融行业合规要求",
│     "domain": "finance-compliance",
│     "version": "2024-Q4"
│   }
├── prompt.md
│   "在分析金融相关需求时，你必须主动检查以下合规要求：
│    - 是否涉及个人信息处理？→ 引用《个人信息保护法》相关条款
│    - 是否涉及资金交易？→ 检查反洗钱要求
│    - 是否涉及跨境数据？→ 检查数据出境规定
│    - 是否涉及投资者适当性？→ 检查适当性管理要求
│    在 PRD 的合规章节中，必须逐项标注适用的法规条款。"
├── knowledge/
│   ├── personal-info-protection.md     ← 个人信息保护法要点
│   ├── anti-money-laundering.md        ← 反洗钱相关要求
│   ├── data-classification.md          ← 数据分类分级标准
│   ├── data-cross-border.md            ← 数据出境规定
│   ├── investor-suitability.md         ← 投资者适当性
│   └── cybersecurity-law.md            ← 网络安全法要点
└── output-template.md
    "合规检查清单输出格式：
     | 检查项 | 是否涉及 | 适用法规 | PRD 中的对应章节 | 状态 |"
```

---

### 9. 历史项目参考 Skill

```
skill-past-projects/
├── skill.json
│   {
│     "name": "历史项目 PRD 参考库",
│     "domain": "internal-reference"
│   }
├── prompt.md
│   "在拆解需求时，参考历史项目的经验：
│    - 相似功能在历史项目中是怎么拆分 User Story 的
│    - 历史项目中踩过的坑（需求遗漏、理解偏差）
│    - 历史项目的非功能需求基线"
├── knowledge/
│   ├── project-a-mobile-banking.md     ← 手机银行项目 PRD 摘要
│   ├── project-b-risk-platform.md      ← 风控平台项目 PRD 摘要
│   ├── project-c-data-platform.md      ← 数据中台项目 PRD 摘要
│   └── common-pitfalls.md              ← 常见需求分析失误总结
└── output-template.md
```

---

### 10. 领域术语 Skill

```
skill-glossary-finance/
├── skill.json
├── prompt.md
│   "在和用户沟通需求时：
│    - 使用标准的金融业务术语
│    - 遇到模糊表述时，用术语表中的标准定义确认
│    - 在 PRD 术语表章节中列出所有使用的专业术语"
├── knowledge/
│   └── glossary.md
│       "| 术语 | 定义 | 英文 | 常见误用 |
│        | 头寸 | ... | Position | 常与"仓位"混淆 |
│        | T+0 | ... | Same-day settlement | ... |
│        | KYC | ... | Know Your Customer | ... |"
```

---

## 三、Skill 加载机制

### 运行时：Skill 怎么注入 Agent

```typescript
// lib/skill-loader.ts

interface Skill {
  name: string;
  domain: string;
  prompt: string;           // 领域指令
  knowledge: string;        // 知识文档（合并后的全文）
  outputTemplate: string;   // 输出格式模板
}

async function loadSkill(skillId: string): Promise<Skill> {
  const skillDir = path.join(SKILLS_DIR, skillId);
  return {
    name: JSON.parse(await fs.readFile(path.join(skillDir, 'skill.json'), 'utf-8')).name,
    domain: JSON.parse(await fs.readFile(path.join(skillDir, 'skill.json'), 'utf-8')).domain,
    prompt: await fs.readFile(path.join(skillDir, 'prompt.md'), 'utf-8'),
    knowledge: await loadKnowledgeDir(path.join(skillDir, 'knowledge')),
    outputTemplate: await fs.readFile(path.join(skillDir, 'output-template.md'), 'utf-8').catch(() => ''),
  };
}

async function loadKnowledgeDir(dir: string): Promise<string> {
  const files = await fs.readdir(dir);
  const contents = await Promise.all(
    files.filter(f => f.endsWith('.md')).map(async f => {
      const content = await fs.readFile(path.join(dir, f), 'utf-8');
      return `### ${f.replace('.md', '')}\n\n${content}`;
    })
  );
  return contents.join('\n\n---\n\n');
}

// 在 API Route 中使用
export async function buildSystemPrompt(skillIds: string[]): Promise<string> {
  const skills = await Promise.all(skillIds.map(loadSkill));

  return [
    BASE_AGENT_PROMPT,  // 基础 Agent 指令（永远不变）
    '',
    '# 已加载的领域 Skill',
    '',
    ...skills.map(s => [
      `## ${s.name}`,
      '',
      s.prompt,
      '',
      '### 领域知识',
      '',
      s.knowledge,
      '',
      s.outputTemplate ? `### 输出格式要求\n\n${s.outputTemplate}` : '',
    ].join('\n')),
  ].join('\n');
}
```

### 前端：项目组选择 Skill

```typescript
// 前端在创建会话时选择 Skill
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    messages,
    skills: ['skill-prd-banking', 'skill-compliance-finance', 'skill-glossary-finance'],
    //       ↑ 银行 PRD 规范      ↑ 金融合规                   ↑ 金融术语
  }),
});
```

---

## 四、优先级建议

### Demo 阶段（前 2 周）
必须有：
- 文档解析 Skill（AWS Document Loader MCP）— 支持用户上传 Word/PDF
- 1 个知识型 Skill（简化版 PRD 模板）— 验证 Skill 热插拔机制

### 第二阶段（2-4 周）
- 图表生成 Skill（Mermaid）
- 文档导出 Skill（Markdown → Word）
- 合规知识 Skill
- 网页抓取 Skill（竞品分析）

### 第三阶段（1-2 月）
- 内部知识库检索（加向量）
- 历史项目参考 Skill
- Skill 管理界面（上传/编辑/启用/禁用）
- Skill 效果评估（哪个 Skill 对 PRD 质量影响最大）
