# ReqAgent

ReqAgent 当前是一个基于 `assistant-ui` 的 AI 工作台原型，主场景仍然是需求分析与对话式 agent 交互，但运行主链路已经收敛到更轻的 `streamText + tool()` 架构。

README 只描述当前真正接线的实现；仓库里仍保留一部分旧的 workflow / thread-state 资产，暂时作为后续演进或清理对象，不视为当前线上主路径。

## 当前阶段

- 前端运行时：`@assistant-ui/react` + `@assistant-ui/react-ai-sdk`
- 模型运行时：Vercel AI SDK v6
- Provider：`@ai-sdk/openai`
- 主入口：`app/page.tsx` -> `AssistantChatTransport` -> `POST /api/chat`
- 主服务端链路：`streamText()` + `tool()` + `toUIMessageStreamResponse()`
- 当前业务工具：`search_knowledge`
- 当前 UI 渲染方式：`MessagePrimitive.Parts` 自定义渲染 `Text / Reasoning / Tool / Empty`
- 测试工具流：输入 `test tools` 或 `测试工具`，触发模拟 tool call stream

## 当前运行链路

1. 用户在首页输入内容，`useChatRuntime()` 通过 `AssistantChatTransport` 将消息发送到 `/api/chat`
2. `app/api/chat/route.ts` 从最后一条用户文本中提取需求描述
3. 如果命中 `test tools` / `测试工具`，服务端直接返回手写的 UI message stream，用于验证 Tool UI
4. 正常路径下，服务端使用 `streamText()` 调用模型，并暴露 `search_knowledge` 工具
5. 返回结果通过 `toUIMessageStreamResponse()` 转成 assistant-ui 可消费的消息流
6. 前端用自定义 part renderers 渲染 Markdown 文本、reasoning block、tool card 和初始 loading indicator

## 当前架构要点

### 1. Wire API 可切换

Provider 配置位于 `lib/ai-provider.ts`。

- `REQAGENT_WIRE_API=chat-completions`：走 `/v1/chat/completions`
- `REQAGENT_WIRE_API=responses`：走 `/v1/responses`
- 默认值是 `chat-completions`

这样做的原因很直接：很多 OpenAI-compatible proxy 对 `responses` 的持久化支持并不稳定，所以默认保守，只有确认代理兼容时再切到 `responses`。

### 2. UI 以 message parts 为核心

当前首页不再走旧的“整块式工作台消息布局”驱动主流程，而是把 assistant 消息拆成 part 来渲染：

- `ReqStreamingIndicator`：首 token 到达前的运行态提示
- `ReqTextPart`：Markdown 文本渲染
- `ReqReasoningPart`：reasoning -> `ReqThinkingBlock`
- `ReqToolCallPart`：tool call fallback -> `ReqToolCard`

这意味着后续新增工具或切换模型事件流时，优先考虑 part renderer 的兼容性，而不是在消息层硬编码大量状态分支。

### 3. 仍有旧 workflow 资产保留在仓库中

以下模块仍然存在，但当前没有接到 `/api/chat` 主路上：

- `lib/workflow.ts`
- `ReqAgentThreadState` 相关 schema / artifacts / pipeline 类型
- 一部分 gallery / workbench 预览组件

这些文件代表之前的显式阶段编排方向，不应再被 README 当作“当前已接线能力”。如果后续要回到多阶段 orchestrator，需要重新设计主入口，而不是假设这些模块仍在生效。

## 关键文件

- `app/page.tsx`：聊天运行时入口
- `app/api/chat/route.ts`：主路由，负责模拟工具流和真实 `streamText` 调用
- `app/gallery/page.tsx`：组件陈列页
- `components/ReqAgentUI.tsx`：聊天主壳，注册 message part renderers
- `components/ReqTextPart.tsx`：Markdown 文本 part
- `components/ReqReasoningPart.tsx`：reasoning part
- `components/ReqToolCallPart.tsx`：tool fallback part
- `components/ReqStreamingIndicator.tsx`：首屏流式等待态
- `lib/ai-provider.ts`：provider 解析与 wire API 选择
- `lib/tools.ts`：领域识别、知识模式、工具辅助函数
- `lib/types.ts`：共享类型、tool execution state、legacy thread state 类型
- `lib/use-agent-activity.ts`：从 metadata / parts 推导运行态活动

## 技术栈

- Next.js 15
- React 19
- TypeScript
- `ai@6`
- `@ai-sdk/openai@3`
- `@assistant-ui/react`
- `@assistant-ui/react-ai-sdk`
- `react-markdown`
- `remark-gfm`
- `zod`

## 环境变量

优先级：`REQAGENT_*` > `OPENAI_*`

```bash
REQAGENT_API_KEY=
REQAGENT_BASE_URL=
REQAGENT_MODEL=
REQAGENT_WIRE_API=chat-completions
```

说明：

- 如果 `REQAGENT_BASE_URL` 只有 host，运行时会自动补 `/v1`
- 未提供 `REQAGENT_MODEL` 时，默认使用 `gpt-4o-mini`
- 兼容 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 作为回退值

## 本地开发

```bash
pnpm install
pnpm dev
```

默认访问地址：

- `http://localhost:3000`

## 校验命令

```bash
pnpm typecheck
pnpm build
```

## 当前已知状态

- 首页聊天主链路已经切到 AI SDK v6 + part renderer 模式
- `/gallery` 仍然是重要的组件陈列与预演页面
- UI 整体还处在 demo 阶段，尤其是 tool card、reasoning block、状态层级和交互细节还需要继续设计
- 仓库中存在旧 workflow 文件和类型，不应误判为当前主路径
- 还没有接 MCP、workspace 文件系统、技能管理、多 agent handoff

## 示例输入

```text
我想做一个在线教育平台，支持视频课程、直播教学、作业提交和批改。目标用户是 K12 学生和家长。
```

```text
测试工具
```
