# ReqAgent v0 — 架构设计

> 基于 2026-03-17 对所有依赖的实际 API 验证结果。不含猜测，每个组件都已确认可用。

---

## 一、一句话架构

```
assistant-ui (前端渲染)
    ↕ AI SDK UI Message Stream Protocol
@openai/agents run() (执行引擎)
    ↕ 原生支持
MCP Server + 业务 Tool (能力层)
```

三层之间的桥接全部由官方包完成，零手写胶水。

---

## 二、技术栈（v0 最终版）

| 层级 | 技术 | 包名 | 版本 | 职责 |
|------|------|------|------|------|
| 框架 | Next.js App Router | `next` | >=15 | 全栈容器 |
| 执行引擎 | OpenAI Agents SDK | `@openai/agents` | **0.7.x** | Agent 定义 / run() / Handoff / MCP |
| 引擎→前端桥接 | agents-extensions | `@openai/agents-extensions` | 0.7.x | `createAiSdkUiMessageStreamResponse()` |
| 模型适配 | agents-extensions/ai-sdk | 同上 | 同上 | `aisdk()` 包装任意 AI SDK model provider |
| 前端 UI | assistant-ui | `@assistant-ui/react` | latest | Thread / Composer / makeAssistantToolUI |
| 前端 Runtime | assistant-ui AI SDK 集成 | `@assistant-ui/react-ai-sdk` | latest | `useChatRuntime()` 消费流 |
| AI SDK 通信 | Vercel AI SDK | `ai` | >=5 | createUIMessageStreamResponse 等底层协议 |
| Model Provider | AI SDK OpenAI Provider | `@ai-sdk/openai` | latest | 支持 OPENAI_BASE_URL 兼容端点 |
| Schema | Zod | `zod` | >=3.25 | Tool 参数校验 |
| 样式 | Tailwind CSS | `tailwindcss` | >=4 | UI 样式 |

### 关键版本升级

| 包 | 当前 | 目标 | 原因 |
|----|------|------|------|
| `@openai/agents` | 0.0.17 | **0.7.x** | API 完全重构，Handoff/MCP/streaming 都在新版 |
| `ai` (Vercel AI SDK) | 4.x | **5.x** | `createUIMessageStreamResponse` 在 v5 |
| `@assistant-ui/react-ai-sdk` | 0.10.x | **latest** | 配合 AI SDK v5 的 `useChatRuntime` |

新增依赖：
- `@openai/agents-extensions` — 官方桥接包

移除：
- `lib/useReqAgentRuntime.ts` — 被 `useChatRuntime` 替代
- `assistant-stream` / `zod-to-json-schema` — 不再需要

---

## 三、架构图

```
┌──────────────────────────────────────────────────────────────┐
│  浏览器                                                       │
│                                                              │
│  app/page.tsx                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  AssistantRuntimeProvider                              │  │
│  │    runtime = useChatRuntime({ api: '/api/chat' })      │  │
│  │                                                        │  │
│  │  ┌──────────────────────┐  ┌────────────────────────┐  │  │
│  │  │  对话区               │  │  产出物面板             │  │  │
│  │  │  ThreadPrimitive      │  │  ArtifactPanel          │  │  │
│  │  │  ComposerPrimitive    │  │  ├ Stories 看板         │  │  │
│  │  │                       │  │  ├ 需求文档 (Markdown)  │  │  │
│  │  │  Tool UIs (内联)      │  │  └ 说明                 │  │  │
│  │  │  ├ ParseInputToolUI   │  │                         │  │  │
│  │  │  ├ SearchKnowledge    │  │  PipelineBar            │  │  │
│  │  │  ├ GenerateStories    │  │  (实时 Agent 执行状态)  │  │  │
│  │  │  └ GenerateDoc        │  │                         │  │  │
│  │  └──────────────────────┘  └────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
│       ↕ AI SDK UI Message Stream Protocol (HTTP)             │
└──────┬───────────────────────────────────────────────────────┘
       │
┌──────▼───────────────────────────────────────────────────────┐
│  app/api/chat/route.ts                                       │
│                                                              │
│  const stream = run(orchestrator, input, { stream: true });  │
│  return createAiSdkUiMessageStreamResponse(stream);          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  @openai/agents  run()                                 │  │
│  │                                                        │  │
│  │  OrchestratorAgent                                     │  │
│  │  ├── handoff → InputParser                             │  │
│  │  │   └── tools: [parse_input]                          │  │
│  │  ├── handoff → ReqDecomposer                           │  │
│  │  │   └── tools: [search_knowledge, generate_stories]   │  │
│  │  └── handoff → DocGenerator                            │  │
│  │      └── tools: [generate_doc]                         │  │
│  │                                                        │  │
│  │  Model: aisdk(openai(OPENAI_MODEL))                    │  │
│  │         ↑ 支持 OPENAI_BASE_URL 兼容端点               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Tool 层                                               │  │
│  │                                                        │  │
│  │  业务 Tool（用 agents SDK 的 tool() 定义）             │  │
│  │  ├── parse_input      解析原始输入为结构化需求          │  │
│  │  ├── search_knowledge 检索领域知识模式                  │  │
│  │  ├── generate_stories 输出结构化 User Story             │  │
│  │  └── generate_doc     输出 Markdown SRS                │  │
│  │                                                        │  │
│  │  MCP Server（agents SDK 原生支持，不用手写）           │  │
│  │  └── (v0 暂不接入，v1 接入 filesystem/doc-loader)     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 四、数据流（一次完整请求）

```
1. 用户在 Composer 输入需求，点击发送
       │
2. useChatRuntime → POST /api/chat  { messages }
       │
3. route.ts:
   const stream = run(orchestrator, messages, { stream: true })
   return createAiSdkUiMessageStreamResponse(stream)
       │
4. agents SDK 执行:
   Orchestrator 判断信息是否充足
   ├── 充足 → handoff → InputParser
   │   InputParser 调用 parse_input tool → 返回 StructuredRequirement
   │   InputParser 完成 → handoff → ReqDecomposer
   │   ReqDecomposer 调用 search_knowledge tool → 返回知识模式
   │   ReqDecomposer 调用 generate_stories tool → 返回 StoryGenerationResult
   │   ReqDecomposer 完成 → handoff → DocGenerator
   │   DocGenerator 调用 generate_doc tool → 返回 DocumentGenerationResult
   │   DocGenerator 完成 → 回到 Orchestrator → 向用户汇总
   └── 不充足 → Orchestrator 直接回复追问
       │
5. 每个事件通过 createAiSdkUiMessageStreamResponse 实时转为:
   text-delta     → 对话区流式文本
   tool-call      → makeAssistantToolUI 渲染 Tool UI
   tool-result    → Tool UI 收到结果，dispatch CustomEvent
   agent-updated  → (可选) PipelineBar 感知 Agent 切换
       │
6. CustomEvent('reqagent:artifact') 同步到:
   ArtifactPanel → Stories 看板 / 文档面板 更新
   PipelineBar   → 阶段状态 idle → running → complete
```

---

## 五、文件结构（v0 目标）

```
reqagent/
├── app/
│   ├── layout.tsx                         # 不变
│   ├── page.tsx                           # useChatRuntime 替代自写 runtime
│   ├── globals.css                        # 不变
│   └── api/chat/
│       └── route.ts                       # 重写: run() + createAiSdkUiMessageStreamResponse()
│
├── components/
│   ├── ReqAgentUI.tsx                     # 小改: 可能增加 Agent 名称展示
│   ├── ArtifactPanel.tsx                  # 改: DocumentView 用 react-markdown
│   ├── PipelineBar.tsx                    # 小改: 响应 agent-updated 事件
│   └── tool-uis/                          # 小改: 确认与新流协议兼容
│       ├── ParseInputToolUI.tsx
│       ├── SearchKnowledgeToolUI.tsx
│       ├── GenerateStoriesToolUI.tsx
│       └── GenerateDocToolUI.tsx
│
├── lib/
│   ├── agents.ts                          # 重写: 真正的 Agent + Handoff 定义
│   ├── tools.ts                           # 重写: 用 @openai/agents 的 tool()
│   └── types.ts                           # 小改: 可能调整字段名
│
├── docs/                                  # 设计文档（不部署）
│
├── [删除] lib/useReqAgentRuntime.ts       # 被 useChatRuntime 替代
├── package.json                           # 升级依赖
└── next.config.ts                         # 可能调整 serverExternalPackages
```

---

## 六、各层详细设计

### 6.1 Agent 定义（lib/agents.ts）

4 个 Agent，1 个 Orchestrator + 3 个子 Agent，通过 handoff 连接。

```
OrchestratorAgent
├── instructions: 理解用户意图，判断信息完整度，追问或分发
├── handoffs: [inputParser, reqDecomposer, docGenerator]
├── tools: 无（编排者不直接操作）
│
├── InputParser
│   ├── instructions: 解析输入，提取结构化需求
│   ├── tools: [parse_input]
│   └── handoffs: 无（完成后自动回到 Orchestrator）
│
├── ReqDecomposer
│   ├── instructions: 检索知识，拆解为 User Story
│   ├── tools: [search_knowledge, generate_stories]
│   └── handoffs: 无
│
└── DocGenerator
    ├── instructions: 生成 Markdown SRS 文档
    ├── tools: [generate_doc]
    └── handoffs: 无
```

### 6.2 Tool 定义（lib/tools.ts）

从 `import { tool } from 'ai'` 迁移到 `import { tool } from '@openai/agents'`。

两者结构几乎一致（都用 Zod schema），主要区别：
- agents SDK 的 `tool()` 有 `name` 字段
- `execute` 函数签名：`(context, args)` vs `(args)`
- 返回值会作为 tool output 传回 Agent

4 个业务 Tool 的逻辑不变，只是换了定义方式。

### 6.3 API Route（app/api/chat/route.ts）

核心代码：

```typescript
import { run } from '@openai/agents';
import { createAiSdkUiMessageStreamResponse } from '@openai/agents-extensions/ai-sdk-ui';
import { aisdk } from '@openai/agents-extensions/ai-sdk';
import { openai } from '@ai-sdk/openai';
import { orchestrator } from '@/lib/agents';

export async function POST(req: Request) {
  const { messages } = await req.json();
  const stream = run(orchestrator, messages, { stream: true });
  return createAiSdkUiMessageStreamResponse(stream);
}
```

模型配置通过 `aisdk()` 包装 AI SDK provider，支持 `OPENAI_BASE_URL`：

```typescript
const model = aisdk(openai(process.env.OPENAI_MODEL || 'gpt-4o-mini'));
```

### 6.4 前端 Runtime（app/page.tsx）

从自写的 `useReqAgentRuntime` 迁移到官方的 `useChatRuntime`：

```typescript
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';

export default function Home() {
  const runtime = useChatRuntime({ api: '/api/chat' });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReqAgentUI />
    </AssistantRuntimeProvider>
  );
}
```

> 降级方案：如果 `@assistant-ui/react-ai-sdk` 仍有构建问题，
> 保留 `useReqAgentRuntime` 作为备用。新的流格式（来自 createAiSdkUiMessageStreamResponse）
> 遵循标准 AI SDK UI Message Stream Protocol，两种 runtime 都能消费。

### 6.5 前端组件

**不变的：**
- `ReqAgentUI.tsx` — 主壳，CustomEvent 监听机制保留
- `tool-uis/*` — makeAssistantToolUI 注册方式保留
- `PipelineBar.tsx` — 通过 CustomEvent 驱动

**需要改的：**
- `ArtifactPanel.tsx` — DocumentView 加 react-markdown
- 可能在 AssistantMessage 中增加 Agent 名称标签（从流事件中获取当前 Agent）

---

## 七、模型 Provider 策略

`@openai/agents` 默认使用 OpenAI Responses API。但我们需要支持 `OPENAI_BASE_URL` 兼容端点，所以通过 `aisdk()` 包装：

```
如果直接用 OpenAI API:
  不需要 aisdk()，agents SDK 直接调用

如果用兼容端点 (OPENAI_BASE_URL):
  用 aisdk(openai(model)) 包装
  openai() 来自 @ai-sdk/openai，自动读取 OPENAI_BASE_URL
```

配置方式不变，还是环境变量：
- `OPENAI_API_KEY` — 必填
- `OPENAI_BASE_URL` — 可选
- `OPENAI_MODEL` — 可选，默认 gpt-4o-mini

---

## 八、MCP 策略

v0 暂不接入 MCP Server。4 个业务 Tool 足够 demo。

v1 接入计划：

```typescript
import { MCPServerStdio } from '@openai/agents';

const filesystemMcp = new MCPServerStdio({
  name: 'filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './workspace'],
});

const docLoaderMcp = new MCPServerStdio({
  name: 'doc-loader',
  command: 'npx',
  args: ['-y', 'awslabs.document-loader-mcp-server'],
});

// Agent 直接使用 MCP
const inputParser = new Agent({
  name: 'InputParser',
  mcpServers: [filesystemMcp, docLoaderMcp],
  tools: [parseInputTool],
  ...
});
```

agents SDK 原生支持 MCP，不需要额外桥接。

---

## 九、与旧架构的对比

| 维度 | 旧（streamText 模拟） | 新（agents SDK 真执行） |
|------|----------------------|----------------------|
| Agent 执行 | 单次 streamText + 单 prompt | run() + 真正 Handoff |
| Tool 定义 | `import { tool } from 'ai'` | `import { tool } from '@openai/agents'` |
| 流协议桥接 | 自写 useReqAgentRuntime (200行) | `createAiSdkUiMessageStreamResponse` (1行) |
| 前端 Runtime | 自写 ChatModelAdapter | `useChatRuntime` (官方) |
| MCP 支持 | 无 | 原生 |
| Agent 切换可见性 | 无（单 prompt） | 有（Handoff 事件） |
| 依赖健康度 | `@openai/agents` 0.0.17 (废弃) | 0.7.x (活跃，昨天发版) |

---

## 十、实施顺序

### Step 1: 升级依赖
- `@openai/agents` 0.0.17 → 0.7.x
- 新增 `@openai/agents-extensions`
- `ai` 4.x → 5.x
- `@assistant-ui/react-ai-sdk` 升级到 latest
- 新增 `react-markdown` + `remark-gfm`

### Step 2: 重写后端
- `lib/tools.ts` — 迁移到 agents SDK tool()
- `lib/agents.ts` — 真正的 Agent + Handoff
- `app/api/chat/route.ts` — run() + createAiSdkUiMessageStreamResponse()

### Step 3: 更新前端
- `app/page.tsx` — useChatRuntime
- `components/ArtifactPanel.tsx` — react-markdown
- 验证 Tool UI 和 CustomEvent 流程
- 删除 `lib/useReqAgentRuntime.ts`

### Step 4: 验证
- typecheck + build
- E2E 测试完整流程
- 移动端验证

---

## 十一、风险和降级

| 风险 | 降级方案 |
|------|---------|
| `@assistant-ui/react-ai-sdk` 构建仍有问题 | 保留 `useReqAgentRuntime`，它能消费相同协议 |
| `@openai/agents` 0.7.x API 与 0.0.17 不兼容 | 已确认不兼容，需要重写 agents.ts（在计划内） |
| `createAiSdkUiMessageStreamResponse` 的 tool call 事件格式与 `makeAssistantToolUI` 不匹配 | 检查事件中的 toolName 字段是否对齐，必要时调整 tool UI 注册名 |
| 兼容端点 (OPENAI_BASE_URL) 通过 aisdk() 不工作 | beta 阶段已知风险，降级为直接用 OpenAI API 测试 |
