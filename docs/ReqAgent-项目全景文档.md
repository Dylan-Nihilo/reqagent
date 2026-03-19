# ReqAgent 项目全景文档

> 本文档汇总了项目的定位、当前架构、决策记录和后续 TODO。
> 可作为 context 文档交给新成员或 AI 编码助手快速上手。
>
> 最近更新：2026-03-19

---

## 一、项目定义

### 1.1 是什么

ReqAgent 是一个 **AI 需求分析工作台**，是多 Agent 编排平台的第一个 Agent。

用户在 WebUI 上输入需求（文字），Agent 进行需求分析，输出：
- 结构化的 User Story（含优先级、验收标准）
- 完整的需求规格说明书（SRS / PRD，Markdown 格式）

### 1.2 为什么从需求拆解入手

整个多 Agent 平台规划了 4 个 Agent：需求拆解 → 领域建模 → 编码 → Review。选择先做需求拆解，因为：
- 需求拆解是整个链路的起点，产出物被后续 Agent 消费
- 架构验证完成后，后续 Agent 可以复用同一套运行时
- 可以独立验证价值，不依赖其他 Agent

### 1.3 核心洞察

> "要想做好 PRD 生成，咱们自己得真正了解 PM 标准化工作流程是什么，还有行里要求的 PRD 要求，金融合规等数据的收集和知识库的建立"

**结论**：Agent 的上限不取决于技术架构，取决于它脑子里装了多少领域知识。框架是管道，知识是水。

---

## 二、技术选型决策日志

### 2.1 四次架构迭代

| 版本 | 方案 | 结果 |
|------|------|------|
| v1 | Python 后端全手写 SSE + React 手写前端 | 放弃——工作量太大 |
| v2 | Python + CopilotKit + AG-UI | 放弃——CopilotKit 认知度低 |
| v3 | Python 后端 + Vercel AI SDK + assistant-ui | 放弃——Python ↔ TypeScript 桥接复杂 |
| **v4（当前）** | **全栈 TypeScript (Next.js)** | ✅ 采纳 |

### 2.2 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Agent 运行时 | Vercel AI SDK v6 `streamText` + `tool()` | 直接对接 `assistant-ui`，零胶水代码 |
| 前端 UI | `@assistant-ui/react` + `@assistant-ui/react-ai-sdk` | Radix 风格可组合原语，`ThreadPrimitive` / `MessagePrimitive` 自由度高 |
| 前端通信 | `useChatRuntime` + `AssistantChatTransport` | 官方集成，消费 UI Message Stream Protocol |
| 样式 | CSS Modules + monochrome 设计系统 (`--reqagent-*`) | gallery-first 开发模式，共享组件零视觉漂移 |
| Wire API | `chat-completions` 默认，`responses` 可选 | 兼容更多 proxy（codex-for.me 不支持 responses store） |
| Schema | `jsonSchema<T>()` 优先于 Zod | proxy 兼容性更好 |

### 2.3 放弃的方案

- **`@openai/agents` SDK**：v0-v4 设计文档多次提及，但实际验证后发现 `run()` + Handoff 需要 proxy 支持 responses persistence（`store`），大多数 proxy 不支持。推迟到 Phase 5。
- **Tailwind CSS**：初版使用，后切换为 CSS Modules monochrome 设计系统，gallery-first 开发模式与 Tailwind utility classes 冲突。
- **`makeAssistantToolUI`**：被 `MessagePrimitive.Parts` 的 `tools.Fallback` 模式替代，统一为 `ReqToolCallPart` 桥接组件。
- **`maxSteps`**：AI SDK v6 中静默失效，改用 `stopWhen: stepCountIs(N)`。
- **`parameters`**：AI SDK v6 tool() 中静默发空 schema，改用 `inputSchema`。

---

## 三、当前架构

### 3.1 技术栈

| 层级 | 技术 | 包名 | 版本 |
|------|------|------|------|
| 框架 | Next.js (App Router) | `next` | 15 |
| React | React 19 | `react` | 19 |
| AI 运行时 | Vercel AI SDK v6 | `ai` | 6.x |
| Model Provider | AI SDK OpenAI Provider | `@ai-sdk/openai` | 3.x |
| 前端 UI | assistant-ui | `@assistant-ui/react` | 0.12.x |
| 前端 Runtime | assistant-ui AI SDK 集成 | `@assistant-ui/react-ai-sdk` | 1.3.x |
| Markdown | react-markdown + remark-gfm | — | — |
| Schema | Zod | `zod` | 3.x |
| 样式 | CSS Modules | — | — |

### 3.2 架构图

```
┌──────────────────────────────────────────────────────────┐
│  浏览器                                                   │
│                                                          │
│  app/page.tsx                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AssistantRuntimeProvider                          │  │
│  │    runtime = useChatRuntime({                      │  │
│  │      transport: new AssistantChatTransport(...)     │  │
│  │    })                                              │  │
│  │                                                    │  │
│  │  ReqAgentUI                                        │  │
│  │  ├── ThreadPrimitive.Messages                      │  │
│  │  │   ├── UserMessage  (MessagePrimitive.Parts)     │  │
│  │  │   └── AssistantMessage                          │  │
│  │  │       └── MessagePrimitive.Parts                │  │
│  │  │           ├── Empty  → ReqStreamingIndicator    │  │
│  │  │           ├── Text   → ReqTextPart (markdown)   │  │
│  │  │           ├── Reasoning → ReqReasoningPart      │  │
│  │  │           └── tools.Fallback → ReqToolCallPart  │  │
│  │  │                                                 │  │
│  │  └── ReqComposer (landing / thread variants)       │  │
│  └────────────────────────────────────────────────────┘  │
│       ↕ UI Message Stream Protocol (HTTP POST)           │
└──────┬───────────────────────────────────────────────────┘
       │
┌──────▼───────────────────────────────────────────────────┐
│  app/api/chat/route.ts                                    │
│                                                          │
│  streamText({                                            │
│    model: reqAgentModel,       // chat() or responses()  │
│    tools: { search_knowledge },                          │
│    stopWhen: stepCountIs(3),                             │
│    ...                                                   │
│  })                                                      │
│  .toUIMessageStreamResponse({                            │
│    sendReasoning: true,                                  │
│    messageMetadata: ({ part }) => AgentActivity 元数据    │
│  })                                                      │
│                                                          │
│  lib/ai-provider.ts                                      │
│  ├── createOpenAI({ apiKey, baseURL })                   │
│  ├── wireApi: "chat-completions" | "responses"           │
│  └── reqAgentModel = provider.chat(modelId)              │
│                                                          │
│  lib/workflow.ts                                         │
│  ├── parseRequirement()   — streamObject + mode:"json"   │
│  ├── generateStories()    — streamObject + mode:"json"   │
│  ├── generateDocument()   — streamText → plaintext       │
│  └── classifyWorkflowError()                             │
└──────────────────────────────────────────────────────────┘
```

### 3.3 数据流

```
1. 用户在 ReqComposer 输入需求，点击发送
       │
2. useChatRuntime → POST /api/chat { messages }
       │
3. route.ts 判断：
   ├── "test tools" / "测试工具" → simulateToolCallStream() (手写 UI stream)
   └── 其他 → streamText + search_knowledge tool + messageMetadata
       │
4. messageMetadata 回调按 part.type 映射 AgentActivity：
   reasoning-* → thinking · text-* → responding · tool-* → tool_calling
       │
5. 客户端 useAgentActivity() 两层推断：
   Layer 2: 读服务端 metadata (优先)
   Layer 1: 从 message parts 类型推断
       │
6. Part 渲染：
   ReqTextPart      → react-markdown + remark-gfm
   ReqReasoningPart → ReqThinkingBlock 桥接
   ReqToolCallPart  → ReqToolCard 桥接
```

### 3.4 环境变量

优先级：`REQAGENT_*` > `OPENAI_*`。BaseURL 自动补 `/v1`。

```
REQAGENT_API_KEY=       # or OPENAI_API_KEY
REQAGENT_BASE_URL=      # or OPENAI_BASE_URL
REQAGENT_MODEL=         # or OPENAI_MODEL (default: gpt-4o-mini)
REQAGENT_WIRE_API=      # chat-completions | responses
```

### 3.5 Proxy 兼容性

| Proxy | chat-completions | responses (multi-step) |
|-------|-----------------|----------------------|
| codex-for.me | ✅ | ❌ (no store) |
| yunwu.ai | ✅ | ✅ |
| 默认策略 | **使用 chat-completions** | — |

---

## 四、关键文件

| 文件 | 职责 |
|------|------|
| `lib/ai-provider.ts` | Provider 配置、wireApi 切换、`getProviderInfo()` |
| `app/api/chat/route.ts` | Route handler：真实 streamText + tools，模拟 tool stream |
| `app/page.tsx` | `useChatRuntime` + `AssistantChatTransport` |
| `components/ReqAgentUI.tsx` | 主壳：Empty/Text/Reasoning/ToolFallback 渲染 |
| `components/ReqTextPart.tsx` | Markdown 文本渲染 |
| `components/ReqReasoningPart.tsx` | Reasoning → ReqThinkingBlock 桥接 |
| `components/ReqToolCallPart.tsx` | Tool call → ReqToolCard 桥接 |
| `components/ReqStreamingIndicator.tsx` | 等待首 token 的 loading dots |
| `lib/types.ts` | 领域类型 + AgentActivity + ToolExecutionState |
| `lib/use-agent-activity.ts` | `useAgentActivity()` hook（server metadata > parts 推断） |
| `lib/tools.ts` | 业务 tool schemas 和 helpers |
| `lib/workflow.ts` | Pipeline 阶段执行逻辑（parse/decompose/document） |

---

## 五、AI SDK v6 关键陷阱

这些是静默 breaking changes——TypeScript 编译通过但运行时失败：

1. **`inputSchema` not `parameters`** — `parameters` 发空 schema `{}`
2. **`stopWhen: stepCountIs(N)` not `maxSteps`** — `maxSteps` 被忽略，默认 1 步
3. **`jsonSchema<T>()` over Zod** — proxy 兼容性更好
4. **Stream chunk types**: `tool-input-start` → `tool-input-available` → `tool-output-available`（不是 `tool-call`/`tool-result`）
5. **`convertToModelMessages()`** 替代手动 message 转换
6. **`AssistantChatTransport({ api })`** 替代裸 `{ api }` 在 `useChatRuntime`

---

## 六、需求分析 Agent 的核心设计

### 6.1 最重要的能力：追问

Agent 的核心价值不是生成文档，而是**知道什么时候该停下来问什么问题**。

设计要点：
- system prompt 内置需求完备性检查框架
- 追问最多 2-3 轮，先问影响架构的大问题
- 能识别模糊和矛盾，主动让用户做取舍

### 6.2 工作流程

```
用户输入需求
    │
    ├── 信息不完整？→ 追问（最多 2 轮）
    │
    ▼
阶段一：输入解析 (parse)
    streamObject → StructuredRequirement
    │
    ▼
阶段二：需求拆解 (decompose)
    searchKnowledgePatterns() → 领域模式
    streamObject → StoryGenerationResult
    │
    ▼
阶段三：文档生成 (document)
    streamText → Markdown SRS
    │
    ▼
向用户展示结果
```

### 6.3 知识库是真正的壁垒

框架谁都能搭，但经过行业专家审核的知识体系是抄不走的。

优先投入方向：
1. 和 PM 团队整理公司 PRD 模板和撰写规范
2. 和合规团队整理金融监管要求摘要
3. 收集历史项目 PRD 作为参考
4. 建立领域术语标准

---

## 七、Gallery-First 开发模式

当前项目采用 **gallery-first** 开发模式：

- 组件在 `/gallery` 页面中作为母版定义和预览
- 首页 (`/`) 消费 gallery 中定义的共享组件
- 验收标准：消息、thinking、tool、composer、artifact、nav 在 gallery 和首页使用同一份实现
- Gallery 包含所有 AgentActivity 和 ToolExecutionState 变体的静态预览

当前 Base 组件（首页已消费）：
`ReqEmptyState` · `ReqMessage` · `ReqThinkingBlock` · `ReqToolCard` · `ReqComposer` · `ReqArtifactFileList` · `ReqNavDrawer` · `ReqScrollToBottom`

Deferred 组件（仅保留 inventory）：
Suggestion Chips · Story Board · Doc Preview · Approval Gate

---

## 八、开发路线

| Phase | 内容 | 状态 |
|-------|------|------|
| **1** | Base chat + state system + tool calling + gallery | ✅ 完成 |
| **2** | Workspace（per-thread isolated FS，agent 读写文件） | 待启动 |
| **3** | MCP integration（连接外部 MCP servers） | 待启动 |
| **4** | Skill/Plugin system（installable capability modules） | 待启动 |
| **5** | Multi-Agent Handoff（`@openai/agents` SDK） | 待启动 |

---

## 九、文档清单

| 文件 | 内容 | 状态 |
|------|------|------|
| `CLAUDE.md` | 项目级 AI 编码指令 | ✅ 当前有效 |
| `AGENTS.md` | 多 AI agent 共享指令 | ✅ 当前有效 |
| `docs/ReqAgent-项目全景文档.md` | 本文档 | ✅ 当前有效 |
| `docs/ReqAgent-Skill目录规划.md` | Phase 4 Skill 系统概念设计 | ⏳ 未实现，概念有效 |
| `docs/ReqAgent-领导汇报方案.md` | 商业价值汇报材料 | ✅ 当前有效 |
