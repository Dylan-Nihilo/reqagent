# ReqAgent

AI-powered requirement analysis workbench. Chinese-first UI, English code/comments.

## Stack

- Next.js 15 + React 19 + TypeScript
- AI runtime: Vercel AI SDK v6 (`ai@6.x`, `@ai-sdk/openai@3.x`)
- UI runtime: `@assistant-ui/react@0.12.x` + `@assistant-ui/react-ai-sdk@1.3.x`
- Styling: CSS Modules, monochrome design system (`--reqagent-*` variables)
- Markdown: `react-markdown` + `remark-gfm`

## AI SDK v6 Critical Rules

These are silent breaking changes — TypeScript compiles but runtime fails:

1. **Use `inputSchema` not `parameters`** in `tool()` — `parameters` sends empty schema `{}`
2. **Use `stopWhen: stepCountIs(N)` not `maxSteps`** — `maxSteps` is ignored, defaults to 1 step
3. **Prefer `jsonSchema<T>()` over Zod** for tool params when targeting OpenAI-compatible proxies
4. **Stream chunk types for tools**: `tool-input-start` → `tool-input-available` → `tool-output-available` (NOT `tool-call`/`tool-result`)

## Wire API

Env var `REQAGENT_WIRE_API` controls the wire format (default: `chat-completions`).

- `chat-completions` → `/v1/chat/completions` — works with all proxies
- `responses` → `/v1/responses` — needs proxy `store` support for multi-step tool calls

Always default to `chat-completions` unless the proxy is known to support responses persistence.

## Environment Variables

Priority: `REQAGENT_*` > `OPENAI_*`. BaseURL auto-appends `/v1` if missing.

```
REQAGENT_API_KEY=       # or OPENAI_API_KEY
REQAGENT_BASE_URL=      # or OPENAI_BASE_URL
REQAGENT_MODEL=         # or OPENAI_MODEL (default: gpt-4o-mini)
REQAGENT_WIRE_API=      # chat-completions | responses
```

## Key Files

| File | Role |
|------|------|
| `lib/ai-provider.ts` | Provider config, wireApi switch, `getProviderInfo()` |
| `app/api/chat/route.ts` | Route handler: real streamText + tools, simulated tool stream |
| `app/page.tsx` | `useChatRuntime` + `AssistantChatTransport` |
| `components/ReqAgentUI.tsx` | Main shell: Empty/Thread layout, message components |
| `lib/part-registry.tsx` | Centralized part→component map (Text/File/Image/Source inlined, Reasoning/Tool delegated) |
| `components/ReqReasoningPart.tsx` | Reasoning → ReqThinkingBlock bridge (has internal state) |
| `components/ReqToolCallPart.tsx` | Tool call → ReqToolCard fallback bridge |
| `components/ReqStreamingIndicator.tsx` | Loading dots while waiting for first token |
| `components/message-ui/ReqMessageUI.tsx` | Display components: MarkdownPreview, FileTile, ImageTile, SourceList, PendingLine |
| `lib/types.ts` | Domain types + AgentActivity + ToolExecutionState |
| `lib/use-agent-activity.ts` | `useAgentActivity()` hook (server metadata > parts inference) |
| `lib/tools.ts` | Business tool schemas and helpers |

## Commands

```bash
pnpm dev          # dev server
pnpm typecheck    # must pass before commit
pnpm build        # production build
```

## Testing Tool Calls

Send a message containing "测试工具" or "test tools" to trigger a simulated tool call flow that bypasses the model and directly tests UI rendering.

## Conventions

- Gallery-first: components are authored in `/gallery`, homepage consumes them
- Monochrome design system with `--reqagent-*` CSS variables
- Chinese UI copy, English code comments
- No `@openai/agents` SDK yet — using Vercel AI SDK v6 `streamText` + `tool()` directly
