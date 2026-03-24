# ReqAgent — Agent Instructions

Shared instructions for all AI coding agents (Claude Code, Codex, etc.) working on this project.

## Vision

ReqAgent is evolving from a **requirement analysis assistant** into a **general-purpose AI Agent platform** accessible via WebUI. The end state is an agent that can:

- Analyze and decompose product requirements into structured artifacts
- Operate within an isolated workspace (read/write files, search code)
- Connect to external services via MCP servers
- Be extended with installable Skills/Plugins
- Delegate tasks across specialist agents via handoff

## Current Status (Phase 1 — Complete)

Streaming chat with real tool calling, agent state system, component gallery.

What works today:
- Streaming text responses with Markdown rendering
- Real tool calling (search_knowledge) with multi-step (model calls tool → gets result → generates summary)
- Agent state system: AgentActivity / ToolExecutionState types + useAgentActivity hook
- Custom part renderers: Text (react-markdown), Reasoning (thinking blocks), Tool (card UI), Streaming indicator
- Component gallery at `/gallery` with all state variants
- Dual wire API: chat-completions (default) / responses (switchable)
- Simulated tool call stream for UI testing ("测试工具" trigger)

## Roadmap

### Phase 2: Workspace

Per-conversation isolated workspace where the agent can read, write, and search files.

- Each thread maps to a workspace directory (initially local FS, later containerized)
- Agent tools: `read_file`, `create_file`, `list_files`, `search_workspace`
- Frontend: file browser panel, artifact list reflects file changes in real-time
- Security: path traversal protection, ignored dirs (.git, node_modules), size limits
- Evolution: local dir → Docker/microVM sandbox → cloud-persisted workspace

### Phase 3: MCP Integration

Connect external MCP servers to dynamically extend agent capabilities.

- Static config (env/config file) → dynamic management UI → marketplace
- AI SDK v6 supports MCP natively in responses mode (`openai.tools.mcp()`)
- Chat-completions mode uses `@modelcontextprotocol/sdk` client as local proxy
- MCP tools render alongside built-in tools in the same ToolCard UI

### Phase 4: Skill / Plugin System

Installable capability modules that bundle tools + prompts + config.

- Skill = manifest (name, description, tools, permissions) + implementation
- Types: built-in skills, MCP-backed skills, composite workflow skills
- Evolution: hardcoded registry → dynamic loading → plugin marketplace
- UI: skill management panel, per-thread skill selection

### Phase 5: Multi-Agent Handoff

Orchestrator delegates to specialist agents based on task type.

- Orchestrator → InputParser (structured parsing)
- Orchestrator → ReqDecomposer (user story generation)
- Orchestrator → DocGenerator (document output)
- Tech path: `@openai/agents` SDK or AI SDK v6 `ToolLoopAgent`

## Architecture

```
Browser (React 19 + Next.js 15)
  └─ useChatRuntime (AssistantChatTransport → POST /api/chat)
      └─ MessagePrimitive.Parts
          ├─ Empty     → ReqStreamingIndicator
          ├─ Text      → ReqTextPart (react-markdown)
          ├─ Reasoning → ReqReasoningPart → ReqThinkingBlock
          └─ tools.Fallback → ReqToolCallPart → ReqToolCard

Server (app/api/chat/route.ts)
  └─ streamText({ model, tools, stopWhen })
      └─ toUIMessageStreamResponse({ sendReasoning, messageMetadata })

Provider (lib/ai-provider.ts)
  └─ createOpenAI({ apiKey, baseURL })
      └─ .chat(modelId)  or  .responses(modelId)
          controlled by REQAGENT_WIRE_API env var
```

## Mandatory Rules

### AI SDK v6 Tool Definitions

```typescript
// CORRECT — v6 uses inputSchema
tool({
  description: "...",
  inputSchema: jsonSchema<{ query: string }>({
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  }),
  execute: async ({ query }) => { ... },
})

// WRONG — parameters is silently ignored in v6
tool({
  description: "...",
  parameters: z.object({ query: z.string() }),  // ← BROKEN: sends empty schema
  execute: async ({ query }) => { ... },
})
```

### Multi-Step Tool Calling

```typescript
// CORRECT — v6 uses stopWhen
streamText({ ..., stopWhen: stepCountIs(5) })

// WRONG — maxSteps is silently ignored in v6
streamText({ ..., maxSteps: 5 })  // ← BROKEN: defaults to 1 step
```

### UI Message Stream Chunks

Tool events use this protocol (NOT `tool-call`/`tool-result`):
- `tool-input-start` — tool call begins
- `tool-input-delta` — argument streaming
- `tool-input-available` — complete input with `input` field (not `args`)
- `tool-output-available` — result with `output` field (not `result`)

### Wire API Compatibility

- Default to `chat-completions` (`/v1/chat/completions`) for proxy compatibility
- `responses` (`/v1/responses`) requires proxy support for `store: true` to enable multi-step
- Set via `REQAGENT_WIRE_API` env var
- When using responses API with multi-step, add `providerOptions: { openai: { store: true } }`

## Environment Variables

Priority: `REQAGENT_*` > `OPENAI_*`

```
REQAGENT_API_KEY       # API key
REQAGENT_BASE_URL      # Base URL (auto-appends /v1 if missing)
REQAGENT_MODEL         # Model ID (default: gpt-4o-mini)
REQAGENT_WIRE_API      # chat-completions (default) | responses
```

## File Structure

```
app/
  api/chat/route.ts    — Route handler (streamText + tools + simulated stream)
  page.tsx             — Runtime setup (useChatRuntime + AssistantChatTransport)
  gallery/page.tsx     — Component gallery page

components/
  ReqAgentUI.tsx       — Main chat shell
  ReqTextPart.tsx      — Markdown text renderer
  ReqReasoningPart.tsx — Reasoning → ThinkingBlock bridge
  ReqToolCallPart.tsx  — ToolCall → ToolCard fallback bridge
  ReqStreamingIndicator.tsx — Loading animation
  ReqThinkingBlock.tsx — Thinking/reasoning display (running/completed/failed)
  ReqToolCard.tsx      — Tool execution card (running/complete/incomplete)
  ReqMessage.tsx       — Message layout wrapper (user/assistant)
  ReqComposer.tsx      — Input composer (landing/thread variants)
  ReqAgentComponentGallery.tsx — Component gallery with all state variants
  ReqAgentPrimitives.module.css — Shared design tokens and animations

lib/
  ai-provider.ts       — Provider config + wireApi switch + getProviderInfo()
  types.ts             — Domain types + AgentActivity + ToolExecutionState + McpConnectionState
  tools.ts             — Tool schemas + business helpers (knowledge patterns, story builder)
  use-agent-activity.ts — Client-side activity derivation hook (2-layer: metadata > parts)
```

## Conventions

- UI copy in Chinese, code comments in English
- CSS Modules with `--reqagent-*` variables, monochrome palette
- Gallery-first: components authored at `/gallery`, consumed by homepage
- `pnpm typecheck` must pass — zero errors — before any commit
- Test tool UI by sending "测试工具" or "test tools" (triggers simulated stream)
- When adding tools: always use `inputSchema` + `jsonSchema<T>()`, never `parameters`
- When adding multi-step: always use `stopWhen: stepCountIs(N)`, never `maxSteps`
