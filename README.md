# ReqAgent v0

ReqAgent 是一个面向需求分析的 Next.js 工作台。当前版本保留 `assistant-ui` 和现有组件壳，但已经改成显式阶段工作流，并固定走 OpenAI Responses API。

## 当前架构

- 前端：`assistant-ui` + `@assistant-ui/react-ai-sdk`
- runtime：`useChatRuntime()` + AI SDK 原生 `UIMessage` stream
- 模型适配：`@ai-sdk/openai` + `responses(model)`
- 后端编排：显式 `clarify -> parse -> decompose -> document` workflow
- 业务状态：以 assistant message `metadata` 作为线程唯一真相源
- 产出物：线程级最新成功 `brief / stories / doc` 快照
- 失败处理：provider / schema / JSON 错误显式写回 runtime metadata

当前阶段链路：

1. `Orchestrator` 判断信息是否充分，并在必要时追问
2. `InputParser` 生成结构化 `brief`
3. `ReqDecomposer` 检索知识模式并生成 `stories`
4. `DocGenerator` 生成 Markdown 需求文档

前端会同步展示：

- 对话流式输出
- Tool UI 调用状态
- 当前阶段 / 当前角色 / thinking
- Stories / 需求文档产出物

## 代码结构

- `app/page.tsx`：`useChatRuntime()` 入口
- `app/api/chat/route.ts`：原生 `UIMessage` stream 输出，显式阶段调度与 metadata 写回
- `lib/provider-config.ts`：ReqAgent 独立 provider 配置解析与安全摘要日志
- `lib/workflow.ts`：阶段决策、Responses API 调用、错误分类与最终总结
- `lib/tools.ts`：业务 schema、本地知识模式和结果装配
- `lib/types.ts`：共享类型、thread state schema、metadata 解析
- `components/`：共享 workbench、消息、thinking、composer、artifact、tool UIs

## 环境变量

ReqAgent 优先读取以下服务端环境变量：

- `REQAGENT_PROVIDER_NAME`
- `REQAGENT_API_KEY`
- `REQAGENT_BASE_URL`
- `REQAGENT_MODEL`

同时兼容旧的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`，但只作为迁移映射层使用。

说明：

- ReqAgent 不会在运行时读取 `~/.codex`。
- 可以参考 Codex 当前可用的 provider 参数手动填写到 `.env.local`。
- 运行时主链路固定使用 Responses API；`chat/completions` 只用于外部诊断，不作为应用主路径。

`.env.local` 可直接基于 `.env.example` 创建。

## 本地运行

```bash
pnpm install
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 校验

```bash
pnpm typecheck
pnpm build
```

## 示例输入

```text
我想做一个在线教育平台，支持视频课程、直播教学、作业提交和批改。目标用户是 K12 学生和家长。
```

## 当前限制

- v0 不接 MCP Server
- 不处理文件上传和附件解析
- Mermaid 在文档面板中按 Markdown 代码块展示，不做图形渲染
- 线程续接仍依赖 UI message history + metadata，不接数据库
