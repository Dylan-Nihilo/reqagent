# ReqAgent — 全栈 TypeScript 实施方案（v4 Final）

> 本文档是一份完整的技术实施规格书。目标：交给 AI 编码助手（如 GPT / Claude Code）可以直接实现。

---

## 一、项目概述

### 1.1 产品定义

ReqAgent 是一个**需求拆解 Agent**，作为多 Agent 编排平台的第一个 Agent。用户在 WebUI 上输入需求（文字/图片/文档），Agent 进行需求分析，输出需求文档和 User Story。

### 1.2 技术选型（最终版）

| 层级 | 技术 | 包名 | 版本要求 |
|------|------|------|---------|
| 框架 | Next.js (App Router) | `next` | >=15 |
| UI 组件 | assistant-ui | `@assistant-ui/react` | latest |
| AI SDK 通信 | Vercel AI SDK | `ai`, `@ai-sdk/openai` | >=4 |
| Agent 编排 | OpenAI Agents SDK TS | `@openai/agents` | latest |
| 工具层 | MCP Servers | 各 MCP 包 | — |
| 样式 | Tailwind CSS + shadcn/ui | `tailwindcss` | >=4 |
| Schema | Zod | `zod` | >=3.25 (v4) |
| 包管理 | pnpm | — | >=9 |

### 1.3 架构图

```
┌─────────────────────────────────────────────────────────┐
│  Next.js App (单一项目)                                  │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │  前端页面层 (app/page.tsx)                         │  │
│  │                                                   │  │
│  │  assistant-ui 组件:                                │  │
│  │    <Thread />        消息列表·流式渲染·自动滚动     │  │
│  │    <Composer />      输入框·附件上传               │  │
│  │    makeAssistantToolUI()  工具调用状态渲染          │  │
│  │                                                   │  │
│  │  Vercel AI SDK:                                   │  │
│  │    useChat() → 连接 /api/chat                     │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │ HTTP Stream                   │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │  API Route (app/api/chat/route.ts)                │  │
│  │                                                   │  │
│  │  Vercel AI SDK:                                   │  │
│  │    streamText() → 流式输出                         │  │
│  │                                                   │  │
│  │  OpenAI Agents SDK (@openai/agents):              │  │
│  │    Agent + Handoff + Tools + Guardrails            │  │
│  │                                                   │  │
│  │  MCP Servers:                                     │  │
│  │    filesystem · bash · 自定义                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 二、项目结构

```
reqagent/
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local                          # OPENAI_API_KEY=sk-xxx
│
├── app/
│   ├── layout.tsx                      # 全局 Layout
│   ├── page.tsx                        # 主页面入口
│   ├── globals.css                     # Tailwind 全局样式
│   │
│   └── api/
│       └── chat/
│           └── route.ts                # POST /api/chat — Agent 入口
│
├── components/
│   ├── ReqAgentUI.tsx                  # 主 UI 布局（左对话 + 右产出物）
│   ├── ArtifactPanel.tsx               # 右侧产出物面板
│   ├── PipelineBar.tsx                 # 底部 Agent 执行状态栏
│   │
│   └── tool-uis/                       # 每个 Tool 的自定义渲染组件
│       ├── ParseInputToolUI.tsx        # 输入解析状态
│       ├── SearchKnowledgeToolUI.tsx   # 知识库搜索状态
│       ├── GenerateDocToolUI.tsx       # 文档生成预览
│       └── GenerateStoriesToolUI.tsx   # User Story 看板
│
├── lib/
│   ├── agents.ts                       # Agent 定义（orchestrator + 子 agents）
│   ├── tools.ts                        # Function Tools 定义
│   ├── mcp.ts                          # MCP Server 配置
│   └── types.ts                        # 共享类型定义
│
└── workspace/                          # Agent 工作目录（文件读写）
    ├── uploads/
    └── outputs/
```

---

## 三、后端实现

### 3.1 Agent 定义

文件：`lib/agents.ts`

```typescript
import { Agent } from '@openai/agents';
import { parseInputTool, searchKnowledgeTool, generateDocTool, generateStoriesTool } from './tools';

/**
 * 输入解析 Agent
 * 职责：将用户的各类输入（文字、图片描述、文档摘要）统一解析为结构化需求描述
 */
export const inputParserAgent = new Agent({
  name: 'InputParser',
  instructions: `你是一个输入解析专家。

你的职责是将用户的原始输入（可能是一句话、一段描述、或者文档摘要）解析为结构化的需求描述。

输出格式为 JSON：
{
  "project_name": "项目名称",
  "raw_summary": "需求概要",
  "entities": ["实体1", "实体2"],
  "target_users": ["用户角色1", "用户角色2"],
  "core_features": ["核心功能1", "核心功能2"],
  "constraints": ["约束条件1"],
  "ambiguities": ["需要澄清的点1"]
}

如果输入信息不足以完成解析，在 ambiguities 中列出需要追问的问题。`,
  tools: [parseInputTool],
});

/**
 * 需求拆解 Agent
 * 职责：将结构化需求拆解为 User Story + 非功能需求 + 优先级矩阵
 */
export const reqDecomposerAgent = new Agent({
  name: 'ReqDecomposer',
  instructions: `你是一个资深需求分析师。

你的职责是将结构化的需求描述拆解为：

1. **User Story 列表**（格式：As a <角色>, I want <功能>, So that <价值>）
   - 每条 Story 包含 id (US-001 格式)、priority (must/should/could)
   - 每条 Story 包含 acceptance_criteria（Given-When-Then 格式，至少 1 条）

2. **非功能需求**（性能、安全性、可用性、可维护性等）

3. **依赖关系**（哪些 Story 依赖其他 Story）

使用 generate_stories 工具输出结构化的 User Story 数据。
使用 search_knowledge 工具搜索类似项目的需求模式作为参考。

关键原则：
- 需求粒度要适中，一个 Story 对应一个可独立交付的功能点
- Must Have 不超过总数的 40%
- 每个 Story 必须有明确的验收标准`,
  tools: [searchKnowledgeTool, generateStoriesTool],
});

/**
 * 文档生成 Agent
 * 职责：根据拆解结果生成完整的需求规格说明书
 */
export const docGeneratorAgent = new Agent({
  name: 'DocGenerator',
  instructions: `你是一个技术文档专家。

你的职责是根据需求拆解结果生成完整的需求规格说明书（SRS）。

文档结构：
1. 项目概述（背景、目标、范围）
2. 功能需求（按模块组织，引用 User Story ID）
3. 非功能需求
4. 数据流图（用 Mermaid 语法描述）
5. 优先级矩阵
6. 术语表

使用 generate_doc 工具输出 Markdown 格式的文档。

关键原则：
- 引用所有相关的 User Story ID
- 非功能需求要有具体的可度量指标
- 数据流图要体现核心业务流程`,
  tools: [generateDocTool],
});

/**
 * 主编排 Agent（Orchestrator）
 * 职责：理解用户意图，调度子 Agent 完成需求分析全流程
 */
export const orchestratorAgent = new Agent({
  name: 'ReqAnalysis',
  instructions: `你是一个需求分析编排者。

你的工作流程：
1. 接收用户输入，判断输入类型和完整度
2. 如果输入信息不完整（如缺少目标用户、缺少约束条件），主动追问（最多 2 轮）
3. 信息充足后，将输入交给 InputParser 解析
4. 将解析结果交给 ReqDecomposer 拆解为 User Story
5. 将拆解结果交给 DocGenerator 生成需求文档
6. 汇总所有结果，向用户展示

关键原则：
- 每一步都要向用户简要汇报当前进度
- 如果用户在任意步骤提出修改意见，暂停流程，处理修改后继续
- 始终保持友好、专业的语气
- 在最终输出时，提示用户可以对哪些内容进行修改`,
  handoffs: [inputParserAgent, reqDecomposerAgent, docGeneratorAgent],
});
```

### 3.2 Tools 定义

文件：`lib/tools.ts`

```typescript
import { tool } from 'ai';  // Vercel AI SDK 的 tool helper
import { z } from 'zod';

/**
 * 解析输入 — InputParser Agent 使用
 * 将原始文本解析为结构化需求描述
 */
export const parseInputTool = tool({
  description: '解析用户输入，提取关键需求信息',
  parameters: z.object({
    raw_input: z.string().describe('用户的原始输入文本'),
  }),
  execute: async ({ raw_input }) => {
    // MVP 阶段：直接返回输入文本，让 Agent 自行解析
    // 后续可接入 NLP 服务做实体提取
    return {
      parsed: true,
      text: raw_input,
      char_count: raw_input.length,
    };
  },
});

/**
 * 搜索知识库 — ReqDecomposer Agent 使用
 * 搜索类似项目的需求模式和最佳实践
 */
export const searchKnowledgeTool = tool({
  description: '搜索需求模式知识库，找到类似项目的需求模板和最佳实践',
  parameters: z.object({
    query: z.string().describe('搜索关键词，如 "在线教育平台" 或 "电商系统"'),
    domain: z.string().optional().describe('领域，如 "education" "ecommerce" "fintech"'),
  }),
  execute: async ({ query, domain }) => {
    // MVP 阶段：返回预置的需求模式
    // 后续可接入向量数据库做语义搜索
    const patterns: Record<string, string> = {
      '教育': '在线教育平台通常包含：课程管理、用户系统、支付系统、学习跟踪、作业系统、直播模块。参考标准：SCORM/xAPI。',
      '电商': '电商系统通常包含：商品管理、购物车、订单系统、支付系统、物流跟踪、评价系统。',
      'default': '通用 SaaS 平台通常包含：用户管理、权限系统、数据看板、通知系统、API 集成。',
    };
    const key = Object.keys(patterns).find(k => query.includes(k)) || 'default';
    return {
      source: 'knowledge_base',
      pattern: patterns[key],
      relevance: 0.85,
    };
  },
});

/**
 * 生成 User Story — ReqDecomposer Agent 使用
 * 输出结构化的 User Story 数据
 */
export const generateStoriesTool = tool({
  description: '生成结构化的 User Story 列表，包含优先级和验收标准',
  parameters: z.object({
    project_name: z.string(),
    stories: z.array(z.object({
      id: z.string().describe('格式如 US-001'),
      role: z.string().describe('用户角色'),
      want: z.string().describe('期望功能'),
      so_that: z.string().describe('业务价值'),
      priority: z.enum(['must', 'should', 'could']),
      acceptance_criteria: z.array(z.string()).describe('验收标准，Given-When-Then 格式'),
    })),
  }),
  execute: async ({ project_name, stories }) => {
    // 直接返回结构化数据，前端 Tool UI 会渲染为看板
    return {
      project_name,
      total: stories.length,
      stories,
      summary: {
        must: stories.filter(s => s.priority === 'must').length,
        should: stories.filter(s => s.priority === 'should').length,
        could: stories.filter(s => s.priority === 'could').length,
      },
    };
  },
});

/**
 * 生成需求文档 — DocGenerator Agent 使用
 * 输出 Markdown 格式的 SRS 文档
 */
export const generateDocTool = tool({
  description: '生成完整的需求规格说明书（SRS），Markdown 格式',
  parameters: z.object({
    project_name: z.string(),
    content: z.string().describe('Markdown 格式的完整 SRS 文档内容'),
  }),
  execute: async ({ project_name, content }) => {
    // MVP 阶段：直接返回内容
    // 后续可写入文件系统、生成 Word/PDF
    return {
      project_name,
      format: 'markdown',
      content,
      char_count: content.length,
    };
  },
});
```

### 3.3 API Route

文件：`app/api/chat/route.ts`

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { orchestratorAgent } from '@/lib/agents';
import { run } from '@openai/agents';

export const maxDuration = 60; // Vercel 函数超时时间

export async function POST(req: Request) {
  const { messages } = await req.json();

  // 方案 A：直接用 Vercel AI SDK 的 streamText + tools
  // 这是最简单的集成方式，把 Agent 的 tools 和 instructions 传给 streamText
  const result = streamText({
    model: openai('gpt-4o'),
    system: orchestratorAgent.instructions,
    messages,
    tools: {
      parse_input: parseInputTool,
      search_knowledge: searchKnowledgeTool,
      generate_stories: generateStoriesTool,
      generate_doc: generateDocTool,
    },
    maxSteps: 10, // 允许多轮 tool call
  });

  return result.toDataStreamResponse();

  // 方案 B（进阶）：用 Agents SDK 的 run() + 手动桥接流
  // 当需要 Handoff 等高级编排能力时使用
  // 参见文档末尾的"进阶：Agents SDK 深度集成"
}
```

> **关于方案 A vs 方案 B**：
> - **方案 A**（推荐 MVP）：直接用 Vercel AI SDK 的 `streamText` + `tools`，把 Agent 的 prompt 和工具传进去。简单直接，和 assistant-ui 完美对接。缺点是没有真正的 Handoff，多个 Agent 的 prompt 需要合并。
> - **方案 B**（进阶）：用 `@openai/agents` 的 `run()` 执行真正的多 Agent 编排（含 Handoff），然后把事件流手动转成 Vercel Data Stream。更强大但更复杂。建议 MVP 用方案 A，验证产品逻辑后再迁移到方案 B。

### 3.4 方案 A 的 Prompt 合并策略

MVP 阶段没有真正的 Handoff，但可以通过一个强大的 system prompt 模拟多 Agent 行为：

```typescript
// lib/system-prompt.ts
export const SYSTEM_PROMPT = `你是 ReqAgent，一个专业的需求分析助手。

你的工作分三个阶段，必须按顺序执行：

## 阶段一：输入解析
- 理解用户的需求描述
- 如果信息不完整，追问关键问题（目标用户、核心功能、约束条件）
- 追问最多 2 轮，之后基于已有信息继续
- 使用 parse_input 工具记录解析结果

## 阶段二：需求拆解
- 使用 search_knowledge 工具搜索类似项目的需求模式
- 将需求拆解为 User Story（As a / I want / So that）
- 按 MoSCoW 方法分配优先级（Must ≤ 40%）
- 每个 Story 包含至少 1 条验收标准（Given-When-Then）
- 使用 generate_stories 工具输出结构化的 Story 数据

## 阶段三：文档生成
- 根据 User Story 生成完整的需求规格说明书
- 包含：项目概述、功能需求、非功能需求、数据流图（Mermaid）、优先级矩阵
- 使用 generate_doc 工具输出 Markdown 文档

## 交互原则
- 每个阶段开始时，简要告知用户当前进度
- 使用中文回复
- 保持专业但友好的语气
- 最终输出后，提示用户可以修改哪些内容`;
```

---

## 四、前端实现

### 4.1 主页面

文件：`app/page.tsx`

```tsx
'use client';

import { AssistantRuntimeProvider } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { ReqAgentUI } from '@/components/ReqAgentUI';

export default function Home() {
  const runtime = useChatRuntime({
    api: '/api/chat',
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReqAgentUI />
    </AssistantRuntimeProvider>
  );
}
```

### 4.2 主布局组件

文件：`components/ReqAgentUI.tsx`

```tsx
'use client';

import { Thread, Composer } from '@assistant-ui/react';
import { useState } from 'react';
import { ArtifactPanel } from './ArtifactPanel';
import { PipelineBar } from './PipelineBar';
import { ParseInputToolUI } from './tool-uis/ParseInputToolUI';
import { SearchKnowledgeToolUI } from './tool-uis/SearchKnowledgeToolUI';
import { GenerateDocToolUI } from './tool-uis/GenerateDocToolUI';
import { GenerateStoriesToolUI } from './tool-uis/GenerateStoriesToolUI';

export function ReqAgentUI() {
  const [activeTab, setActiveTab] = useState<'doc' | 'stories' | 'proto'>('stories');

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-zinc-800 bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-sm font-bold text-white">
            R
          </div>
          <span className="text-base font-semibold tracking-tight">ReqAgent</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
            demo
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧: 对话面板 */}
        <div className="w-[45%] flex flex-col border-r border-zinc-800">
          {/*
            Thread 组件 — assistant-ui 核心
            自动处理: 消息列表、流式渲染、自动滚动、Markdown、代码高亮
            通过 tools prop 注册 Tool UI 组件
          */}
          <Thread
            tools={[
              ParseInputToolUI,
              SearchKnowledgeToolUI,
              GenerateDocToolUI,
              GenerateStoriesToolUI,
            ]}
          />
        </div>

        {/* 右侧: 产出物面板 */}
        <div className="flex-1 flex flex-col">
          <ArtifactPanel activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </div>

      {/* 底部: Pipeline 状态栏 */}
      <PipelineBar />
    </div>
  );
}
```

### 4.3 Tool UI 组件

每个 Tool UI 组件用 `makeAssistantToolUI` 创建。当 Agent 调用对应的 tool 时，assistant-ui 自动在消息流中渲染该组件。

文件：`components/tool-uis/SearchKnowledgeToolUI.tsx`

```tsx
import { makeAssistantToolUI } from '@assistant-ui/react';

export const SearchKnowledgeToolUI = makeAssistantToolUI({
  toolName: 'search_knowledge',
  render: ({ args, result, status }) => (
    <div className="flex items-center gap-2 my-2 px-3 py-2 bg-amber-950/20 rounded-lg border border-amber-800/20 text-sm">
      <span className={status === 'running' ? 'animate-bounce' : ''}>
        {status === 'running' ? '🔍' : '✅'}
      </span>
      <span className="text-amber-300">
        {status === 'running'
          ? `搜索知识库: "${args?.query || '...'}"` 
          : '知识库检索完成'}
      </span>
      {result && (
        <span className="ml-auto text-xs text-amber-500/60">
          相关度 {(result as any)?.relevance ? `${((result as any).relevance * 100).toFixed(0)}%` : '—'}
        </span>
      )}
    </div>
  ),
});
```

文件：`components/tool-uis/ParseInputToolUI.tsx`

```tsx
import { makeAssistantToolUI } from '@assistant-ui/react';

export const ParseInputToolUI = makeAssistantToolUI({
  toolName: 'parse_input',
  render: ({ status }) => (
    <div className="flex items-center gap-2 my-2 px-3 py-2 bg-blue-950/20 rounded-lg border border-blue-800/20 text-sm">
      <span className={status === 'running' ? 'animate-spin' : ''}>
        {status === 'running' ? '⚙️' : '✅'}
      </span>
      <span className="text-blue-300">
        {status === 'running' ? '正在解析输入...' : '输入解析完成'}
      </span>
    </div>
  ),
});
```

文件：`components/tool-uis/GenerateStoriesToolUI.tsx`

```tsx
import { makeAssistantToolUI } from '@assistant-ui/react';

/**
 * 当 Agent 调用 generate_stories 工具时，渲染为 User Story 看板。
 * result 是 generateStoriesTool 返回的结构化数据。
 */
export const GenerateStoriesToolUI = makeAssistantToolUI({
  toolName: 'generate_stories',
  render: ({ args, result, status }) => {
    if (status === 'running') {
      return (
        <div className="flex items-center gap-2 my-2 px-3 py-2 bg-violet-950/20 rounded-lg border border-violet-800/20 text-sm">
          <span className="animate-pulse">📋</span>
          <span className="text-violet-300">正在生成 User Story...</span>
        </div>
      );
    }

    const data = result as any;
    if (!data?.stories) return null;

    const priorityConfig = {
      must: { label: 'Must Have', color: 'text-red-400', bg: 'bg-red-950/20', border: 'border-red-800/20' },
      should: { label: 'Should Have', color: 'text-amber-400', bg: 'bg-amber-950/20', border: 'border-amber-800/20' },
      could: { label: 'Could Have', color: 'text-zinc-400', bg: 'bg-zinc-800/40', border: 'border-zinc-700/30' },
    };

    return (
      <div className="my-3 border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>📋</span>
            <span className="text-sm font-medium">{data.project_name} — User Stories</span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">{data.total} stories</span>
        </div>
        <div className="grid grid-cols-3 gap-px bg-zinc-800">
          {(['must', 'should', 'could'] as const).map(priority => {
            const config = priorityConfig[priority];
            const stories = data.stories.filter((s: any) => s.priority === priority);
            return (
              <div key={priority} className="bg-zinc-950 p-3">
                <div className={`text-xs font-semibold uppercase tracking-wider ${config.color} mb-2`}>
                  {config.label} ({stories.length})
                </div>
                <div className="space-y-2">
                  {stories.map((story: any) => (
                    <div key={story.id} className={`p-2 rounded-lg ${config.bg} border ${config.border}`}>
                      <div className="text-[10px] text-zinc-500 font-mono">{story.id}</div>
                      <div className="text-xs text-zinc-300 mt-1">
                        作为<span className={config.color}>{story.role}</span>，我想{story.want}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  },
});
```

文件：`components/tool-uis/GenerateDocToolUI.tsx`

```tsx
import { makeAssistantToolUI } from '@assistant-ui/react';

export const GenerateDocToolUI = makeAssistantToolUI({
  toolName: 'generate_doc',
  render: ({ args, result, status }) => {
    if (status === 'running') {
      return (
        <div className="flex items-center gap-2 my-2 px-3 py-2 bg-cyan-950/20 rounded-lg border border-cyan-800/20 text-sm">
          <span className="animate-pulse">📄</span>
          <span className="text-cyan-300">正在生成需求文档...</span>
        </div>
      );
    }

    const data = result as any;
    if (!data?.content) return null;

    return (
      <div className="my-3 border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>📄</span>
            <span className="text-sm font-medium">{data.project_name} — 需求规格说明书</span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">{data.char_count} 字符</span>
        </div>
        <div className="p-4 max-h-80 overflow-y-auto bg-zinc-900">
          {/* MVP: 原始 Markdown 文本显示。后续用 react-markdown 渲染 */}
          <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed">
            {data.content}
          </pre>
        </div>
      </div>
    );
  },
});
```

### 4.4 产出物面板

文件：`components/ArtifactPanel.tsx`

```tsx
'use client';

interface ArtifactPanelProps {
  activeTab: 'doc' | 'stories' | 'proto';
  onTabChange: (tab: 'doc' | 'stories' | 'proto') => void;
}

const tabs = [
  { id: 'doc' as const, icon: '📄', label: '需求文档' },
  { id: 'stories' as const, icon: '📋', label: '用户故事' },
  { id: 'proto' as const, icon: '🎨', label: '原型' },
];

export function ArtifactPanel({ activeTab, onTabChange }: ArtifactPanelProps) {
  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-1 p-2 border-b border-zinc-800 bg-zinc-900">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-indigo-500/10 text-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="text-sm text-zinc-500 text-center mt-20">
          {activeTab === 'doc' && '需求文档将在 Agent 生成后展示在这里'}
          {activeTab === 'stories' && 'User Story 看板将在 Agent 拆解后展示在这里'}
          {activeTab === 'proto' && '低保真原型将在后续版本支持'}
        </div>
        {/* 
          TODO: 从 Thread 的 tool call 结果中提取数据，渲染到这个面板。
          可以用 assistant-ui 的 useThreadRuntime() 获取消息历史中的 tool results，
          找到 generate_stories / generate_doc 的结果来渲染。
        */}
      </div>
    </>
  );
}
```

### 4.5 Pipeline 状态栏

文件：`components/PipelineBar.tsx`

```tsx
'use client';

/**
 * 底部状态栏 — 展示 Agent 执行链路进度。
 * MVP 阶段为静态展示，后续可从 Thread 事件中动态推导。
 */
export function PipelineBar() {
  return (
    <div className="flex items-center gap-4 px-6 py-2 border-t border-zinc-800 bg-zinc-900 text-xs">
      <span className="text-zinc-500">Pipeline:</span>
      <div className="flex items-center gap-1">
        {[
          { label: '输入解析', tool: 'parse_input' },
          { label: '知识检索', tool: 'search_knowledge' },
          { label: '需求拆解', tool: 'generate_stories' },
          { label: '文档生成', tool: 'generate_doc' },
        ].map((step, i, arr) => (
          <span key={step.tool} className="flex items-center gap-1">
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {step.label}
            </span>
            {i < arr.length - 1 && <span className="text-zinc-600">→</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
```

### 4.6 全局 Layout

文件：`app/layout.tsx`

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReqAgent — 需求分析助手',
  description: '基于多 Agent 的智能需求拆解平台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

---

## 五、安装和启动

### 5.1 初始化项目

```bash
# 1. 创建 Next.js 项目
pnpm create next-app@latest reqagent --typescript --tailwind --eslint --app --src-dir=false
cd reqagent

# 2. 安装 assistant-ui
npx assistant-ui init

# 3. 安装核心依赖
pnpm add ai @ai-sdk/openai @openai/agents zod

# 4. 安装 assistant-ui AI SDK 集成
pnpm add @assistant-ui/react-ai-sdk

# 5. 环境变量
echo "OPENAI_API_KEY=sk-your-key-here" > .env.local
```

### 5.2 启动开发

```bash
pnpm dev
# 打开 http://localhost:3000
```

### 5.3 测试对话

在输入框中输入：
```
我想做一个在线教育平台，支持视频课程、直播教学、作业提交和批改。目标用户是 K12 学生和家长。
```

预期行为：
1. Agent 可能追问 1-2 个问题（如并发数、是否需要 AI 批改）
2. 调用 parse_input → 前端显示"解析输入中..."指示器
3. 调用 search_knowledge → 前端显示"搜索知识库..."指示器
4. 调用 generate_stories → 前端渲染 User Story 看板组件
5. 调用 generate_doc → 前端渲染需求文档预览组件

---

## 六、后续迭代路径

### Phase 1.1（当前 MVP — 2 周）
- [x] 纯文本对话 → Agent 分析 → User Story + 需求文档
- [x] Tool UI 渲染工具调用状态
- [ ] 右侧面板同步展示产出物

### Phase 1.2（体验完善 — 2 周）
- [ ] 接入 MCP Filesystem Server，支持文件上传（Word/PDF/图片）
- [ ] 右侧产出物面板从 tool results 中动态提取数据
- [ ] Pipeline 状态栏动态更新
- [ ] 导出功能（Markdown → Word / JSON）

### Phase 2（真正的多 Agent — 迁移方案 B）
- [ ] 从 streamText 迁移到 @openai/agents 的 run() + Handoff
- [ ] 实现 Data Stream Protocol 适配层（约 100 行）
- [ ] 多 Agent 之间的 Handoff 可视化

### Phase 3（扩展新 Agent）
- [ ] 领域建模 Agent（ER 图、API 设计）
- [ ] 编码 Agent（脚手架生成、单元测试）
- [ ] Review Agent（代码审查、安全扫描）

---

## 七、关键配置文件

### package.json 核心依赖

```json
{
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19",
    "@assistant-ui/react": "latest",
    "@assistant-ui/react-ai-sdk": "latest",
    "ai": "^4",
    "@ai-sdk/openai": "latest",
    "@openai/agents": "latest",
    "zod": "^3.25"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/react": "^19",
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "latest"
  }
}
```

### .env.local

```
OPENAI_API_KEY=sk-your-key-here
```

### next.config.ts

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 如果用 MCP Server（子进程），需要启用 serverExternalPackages
  serverExternalPackages: ['@openai/agents'],
};

export default nextConfig;
```

---

## 八、注意事项

1. **assistant-ui 版本**：运行 `npx assistant-ui init` 会自动配置 shadcn/ui + Tailwind + 主题。不要手动安装 shadcn，让 init 命令处理。

2. **Zod 版本**：`@openai/agents` 要求 Zod v4（>=3.25）。如果 `pnpm add zod` 安装的是 v3.x 旧版，需要 `pnpm add zod@latest`。

3. **API Route 超时**：`streamText` 是长连接，本地开发没问题。部署到 Vercel 时需要设置 `export const maxDuration = 60`。自部署无此限制。

4. **方案 A 的局限**：MVP 用 streamText + tools 实际上是单个 LLM 调用配多个工具，不是真正的多 Agent Handoff。Agent 的"分阶段"行为靠 system prompt 引导。这对 demo 足够了，但产品化时要迁移到方案 B。

5. **暗色主题**：assistant-ui 默认支持 `dark` class。在 `<html>` 上加 `className="dark"` 即可。

6. **Tool UI 的 result 类型**：`makeAssistantToolUI` 的 `render` 中，`result` 是 `unknown` 类型。需要用 `as any` 或自定义类型断言。这是 assistant-ui 的已知限制。
