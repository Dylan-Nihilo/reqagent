# ReqAgent 项目全景文档

> 本文档汇总了从 0 到 1 的完整设计过程，包含决策记录、最终方案、产物清单和后续 TODO。
> 可作为项目启动的 context 文档，交给任何新成员或 AI 编码助手快速上手。

---

## 一、项目定义

### 1.1 是什么

ReqAgent 是一个**需求拆解 Agent**，是多 Agent 编排平台的第一个 Agent。

用户在 WebUI 上输入需求（文字、图片、Word、PDF 等素材），Agent 进行需求分析，输出：
- 结构化的 User Story（含优先级、验收标准）
- 完整的需求规格说明书（SRS / PRD）
- 低保真原型（后续版本）

### 1.2 为什么从需求拆解入手

整个多 Agent 平台规划了 4 个 Agent：需求拆解 → 领域建模 → 编码 → Review。选择先做需求拆解，因为：
- 架构设计完成后，后续 Agent 可以通过微调实现
- 需求拆解是整个链路的起点，产出物被后续 Agent 消费
- 可以独立验证价值，不依赖其他 Agent

### 1.3 核心洞察（来自同事反馈）

> "要想做好 PRD 生成，咱们自己得真正了解 PM 标准化工作流程是什么，还有行里要求的 PRD 要求，金融合规等数据的收集和知识库的建立"

**结论**：Agent 的上限不取决于技术架构，取决于它脑子里装了多少领域知识。框架是管道，知识是水。

---

## 二、技术选型演进（决策日志）

### 2.1 四次架构迭代

| 版本 | 方案 | 放弃原因 |
|------|------|---------|
| v1 | Python 后端全手写 SSE + React 手写前端 | 工作量太大（约 2800 行胶水代码） |
| v2 | Python + CopilotKit + AG-UI | CopilotKit 认知度低，国内几乎没人用 |
| v3 | Python 后端 + Vercel AI SDK + assistant-ui | Python ↔ TypeScript 桥接复杂 |
| **v4（最终）** | **全栈 TypeScript (Next.js)** | ✅ 采纳 |

### 2.2 关键决策点

**Agent SDK 选择：OpenAI Agents SDK**
- 轻量原语（Agent / Tool / Handoff / Guardrail）
- 天然支持多 Agent 编排
- 不绑定 OpenAI 模型（可接任意兼容 API）
- TypeScript 和 Python 版功能对等
- npm 月下载 150 万+

**工具层选择：MCP Server**
- 行业标准协议，现成 Server 丰富
- 文件读写、Bash、搜索都不需要手写
- Agents SDK 原生支持 MCP

**前端 UI 选择：assistant-ui**
- Radix 风格可组合原语，UI 自由度高
- shadcn/ui 主题，开箱即用
- makeAssistantToolUI 实现 Generative UI
- YC 背书，ThoughtWorks 技术雷达收录

**前端通信选择：Vercel AI SDK**
- 月下载 2000 万+，绝对主流
- streamText + useChat 配套完整
- Data Stream Protocol 文档清晰

**放弃的方案及原因**：
- LangChain/LangGraph：太重，抽象层级过高
- CopilotKit：认知度不够，AG-UI 协议落地少
- Vercel AI SDK 做全部（不用 assistant-ui）：只有 hooks 没有 UI 组件，要手写太多
- Python 后端：和 TypeScript 前端桥接复杂，demo 阶段不值得

### 2.3 GPT 执行时遇到的问题

在实际编码过程中暴露了以下兼容性问题：

1. **`ai` 包 API 名字对不上** — Vercel AI SDK 迭代快，v3/v4/v5/v6 API 变化大
2. **assistant-ui 导出和文档示例不一致** — 快速迭代中
3. **`@openai/agents` 和 `ai` 包 tool() 类型不兼容** — 两套 tool 定义体系
4. **`@assistant-ui/react-ai-sdk` 构建期包导出问题** — 引用了错误的导出路径，build 不过

**GPT 的解法**：保留 assistant-ui 的 UI 组件（Thread、Tool UI），但放弃官方桥接包 `@assistant-ui/react-ai-sdk`，自己写了一个本地 runtime adapter（`useReqAgentRuntime.ts`）。这是合理的降级方案，assistant-ui 官方文档支持 LocalRuntime 模式。

**风险评估**：自写 adapter 意味着前后端事件协议由自己维护。但 Vercel Data Stream Protocol 本身是稳定的公开协议，adapter 只有 100-150 行，风险可控。建议关注 `@assistant-ui/react-ai-sdk` 修复进度，修好后换回去。

---

## 三、最终架构（v4）

### 3.1 技术栈

| 层级 | 技术 | 包名 |
|------|------|------|
| 框架 | Next.js (App Router) | `next` >=15 |
| UI 组件 | assistant-ui | `@assistant-ui/react` |
| AI SDK | Vercel AI SDK | `ai`, `@ai-sdk/openai` |
| Agent 编排 | OpenAI Agents SDK TS | `@openai/agents` |
| 工具层 | MCP Servers | 各 MCP 包 |
| 样式 | Tailwind CSS + shadcn/ui | `tailwindcss` >=4 |
| Schema | Zod v4 | `zod` >=3.25 |

### 3.2 架构图

```
┌─────────────────────────────────────────────────────┐
│  Next.js App（一个项目，一个语言，一个进程）           │
│                                                     │
│  前端页面层                                          │
│  ├── assistant-ui: <Thread /> <Composer />           │
│  ├── Tool UI: makeAssistantToolUI()                  │
│  └── Vercel AI SDK: useChat() → /api/chat           │
│                    │                                 │
│  API Route 层      ▼                                 │
│  ├── Vercel AI SDK: streamText() + tools             │
│  ├── System Prompt: 基础指令 + Skill 知识注入         │
│  └── Tools: parse_input / search_knowledge /         │
│             generate_stories / generate_doc           │
│                    │                                 │
│  MCP Server 层     ▼                                 │
│  ├── Filesystem MCP（文件读写）                       │
│  ├── Document Loader MCP（文档解析）                  │
│  └── 自定义 MCP Server（知识库检索等）                │
└─────────────────────────────────────────────────────┘
```

### 3.3 MVP 策略（方案 A vs B）

**方案 A（当前 MVP）**：用 Vercel AI SDK 的 `streamText` + `tools`，把多个 Agent 的职责合并到一个 system prompt 里，用 `maxSteps: 10` 让模型自主决定工具调用顺序。简单直接，和 assistant-ui 完美对接。

**方案 B（后续迁移）**：用 `@openai/agents` 的 `run()` 执行真正的多 Agent Handoff，把事件流手动转成 Vercel Data Stream Protocol。更强大但更复杂。

**迁移时机**：当需要真正的 Agent 切换（Handoff）和独立的 Agent 状态管理时。

### 3.4 前后端事件协议

当前使用 **Vercel Data Stream Protocol** 标准事件，不需要自己设计：

```
message-start          消息开始
text-start/delta/end   流式文本
tool-call-start        工具调用开始（前端自动渲染 Tool UI）
tool-call-result       工具调用结果
step-finish            一步完成
message-finish         消息结束
```

未来扩展 Handoff 时，通过**自定义 tool call 或 data part** 实现，不需要重新设计协议。

---

## 四、Skill 体系设计

### 4.1 两类 Skill

**能力型 Skill（通用工具，实际是 MCP Server / Tool）**：

| Skill | 实现方式 | 现成方案 |
|-------|---------|---------|
| 文档解析（PDF/Word/Excel） | MCP Server | AWS Document Loader MCP |
| 图片/截图识别 | LLM Vision + OCR MCP | GPT-4o Vision / Docling |
| 网页抓取 | MCP Server | Playwright MCP |
| 文档导出（Markdown→Word） | 自建 Tool | 模板填充 + pandoc |
| 图表生成 | Agent 输出 Mermaid | 前端 mermaid.js 渲染 |
| 知识库检索 | 自建 Tool | 关键词/向量检索 |

**知识型 Skill（领域知识，按项目组热插拔）**：

| Skill | 内容 |
|-------|------|
| PRD 模板与规范 | 公司标准 PRD 模板、撰写指南、评审 checklist |
| 金融合规知识 | 个保法、反洗钱、数据分类分级、网安法 |
| 历史项目参考 | 历史 PRD 摘要、常见需求分析失误 |
| 领域术语表 | 金融术语标准定义、常见误用 |

### 4.2 Skill 热插拔机制

Skill 就是一个文件夹：

```
my-skill/
├── skill.json           # 元信息
├── prompt.md            # 注入 Agent 的领域指令
├── knowledge/           # 知识文档
│   └── *.md
└── output-template.md   # 产出物格式模板
```

运行时加载：用户选择 Skill → 后端读文件 → 拼进 system prompt。不需要重启服务。

```typescript
// API Route 中
const skills = await Promise.all(skillIds.map(loadSkill));
const systemPrompt = [BASE_PROMPT, ...skills.map(s => s.prompt + s.knowledge)].join('\n\n');
```

### 4.3 长文档处理（不是 Skill）

长 PDF（>20 页、跨页表格）不适合做成 Skill，应该做成 **Tool**：

```
短文档 → MCP 文档解析器直接提取全文 → 作为 context
长文档 → chunk + embedding → 向量库 → Agent 按需检索
```

可复用财报系统的 chunk + embedding 管线，封装为 MCP Server。

### 4.4 与 Claude Code 概念的映射

| Claude Code | ReqAgent | 说明 |
|-------------|----------|------|
| Skill | 知识型 Skill | prompt + 知识文档 |
| MCP Server | 能力型 Tool | 实际执行代码逻辑 |
| Plugin | 项目组 Skill 包 | 多个 Skill + MCP 打包分发 |

---

## 五、需求分析 Agent 的核心设计

### 5.1 最重要的能力：追问

Agent 的核心价值不是生成文档，而是**知道什么时候该停下来问什么问题**。

设计要点：
- system prompt 里内置需求完备性检查框架（目标用户、核心场景、非功能约束、集成需求、边界条件）
- 追问最多 2-3 轮，先问影响架构的大问题
- 能识别模糊和矛盾，主动让用户做取舍

### 5.2 Agent 的工作流程

```
用户输入需求
    │
    ├── 信息不完整？→ 追问（最多 2 轮）
    │
    ▼
阶段一：输入解析
    调用 parse_input tool
    输出结构化需求描述 JSON
    │
    ▼
阶段二：需求拆解
    调用 search_knowledge tool（检索知识库/合规要求）
    调用 generate_stories tool（输出 User Story）
    │
    ▼
阶段三：文档生成
    调用 generate_doc tool（输出 Markdown SRS）
    │
    ▼
向用户展示结果，提示可修改的内容
```

### 5.3 知识库是真正的壁垒

框架谁都能搭，但经过行业专家审核的、符合金融合规要求的知识体系是抄不走的。

优先投入精力的方向：
1. 和 PM 团队整理公司 PRD 模板和撰写规范
2. 和合规团队整理金融监管要求摘要
3. 收集历史项目 PRD 作为参考
4. 建立领域术语标准

---

## 六、产物清单

### 6.1 本次对话产出的文档

| 文件 | 内容 | 状态 |
|------|------|------|
| `ReqAgent-架构设计.md` | v1 架构（Python 全手写） | 已废弃，仅供参考 |
| `ReqAgent-架构深化-Skill-ToolRuntime-状态协议.md` | v2 深化：Skill/Tool Runtime/前端状态协议 | 已废弃，部分设计思路可参考 |
| `ReqAgent-架构v2-现成生态方案.md` | v2 架构（CopilotKit + AG-UI） | 已废弃 |
| `ReqAgent-架构v3-VercelAISDK-AssistantUI.md` | v3 架构（Python + Vercel AI SDK） | 已废弃 |
| `ReqAgent-v4-全栈TS实施方案-Final.md` | **v4 最终方案（全栈 TS）** | ✅ 当前方案 |
| `ReqAgent-Skill目录规划.md` | Skill 分类 + 10 个具体 Skill 规划 | ✅ 有效 |
| `ReqAgent-UI-Prototype.jsx` | UI 原型（React 组件） | ✅ 参考用 |

### 6.2 已交给 GPT 执行的内容

- v4 实施方案已交付 GPT 开始编码
- GPT 遇到 `@assistant-ui/react-ai-sdk` 构建问题
- GPT 自行降级为 LocalRuntime adapter（`useReqAgentRuntime.ts`）
- 当前状态：**编码进行中**

### 6.3 待产出

| 待办 | 负责人 | 优先级 |
|------|--------|--------|
| PRD 模板（公司标准版） | PM 团队 | 高 |
| 金融合规要求摘要 | 合规团队 | 高 |
| 历史项目 PRD 收集 | 项目组 | 中 |
| 领域术语表 | 业务分析师 | 中 |
| 长文档 chunk+embedding 管线封装 | Dylan（复用财报系统） | 中 |
| Skill 管理界面 | 前端开发 | 低（后续） |

---

## 七、开发计划

### Phase 1：MVP（2 周）
- 全栈 TS 项目搭建
- 4 个核心 Tool 实现
- assistant-ui 对话界面 + Tool UI
- 纯文本输入 → User Story + 需求文档

### Phase 1.5：Skill 热插拔验证（1 周）
- 实现 Skill 加载机制
- 创建 1 个示例知识型 Skill（简化版 PRD 模板）
- 前端 Skill 选择器

### Phase 2：文件处理（2 周）
- 接入 Document Loader MCP（支持上传 Word/PDF）
- 长文档处理 Tool（chunk + embedding，复用财报管线）
- 右侧产出物面板完善
- 文档导出功能

### Phase 3：真正的多 Agent（2-4 周）
- 从 streamText 迁移到 @openai/agents 的 run() + Handoff
- Data Stream Protocol 适配层
- Agent 切换可视化
- Pipeline 状态栏动态更新

### Phase 4：平台化（1-2 月）
- 新增领域建模 Agent
- 新增编码 Agent
- 新增 Review Agent
- Skill 管理界面（上传/编辑/启用/禁用）
- 知识库向量检索

---

## 八、技术备忘

### 关键 npm 包版本

```json
{
  "next": ">=15",
  "@assistant-ui/react": "latest",
  "ai": ">=4",
  "@ai-sdk/openai": "latest",
  "@openai/agents": "latest",
  "zod": ">=3.25"
}
```

### 注意事项

1. `npx assistant-ui init` 会自动配 shadcn/ui + Tailwind，不要手动装
2. Zod 必须 v4（`@openai/agents` 要求）
3. `@assistant-ui/react-ai-sdk` 当前有构建问题，用 LocalRuntime 绕过
4. `<html className="dark">` 启用暗色主题
5. `streamText` 的 `maxSteps: 10` 允许多轮 tool call
6. Vercel 部署需要 `export const maxDuration = 60`

### 相关链接

- OpenAI Agents SDK TS: https://openai.github.io/openai-agents-js/
- assistant-ui: https://www.assistant-ui.com/docs
- Vercel AI SDK: https://ai-sdk.dev/docs/introduction
- Vercel Data Stream Protocol: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
- AWS Document Loader MCP: https://awslabs.github.io/mcp/servers/document-loader-mcp-server
- MCP Server 目录: https://www.pulsemcp.com/
