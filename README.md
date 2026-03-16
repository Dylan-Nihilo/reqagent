# ReqAgent MVP

ReqAgent is a pragmatic MVP for structured requirement analysis under `projects/reqagent`.

It follows the spec's recommended MVP path:

- Next.js App Router scaffold
- assistant-ui for the threaded chat surface
- Vercel AI SDK for streaming tool calls and responses
- Tool-driven phases for parsing, requirement decomposition, and document generation
- `@openai/agents` definitions included as forward-compatible placeholders
- Explicit note that true multi-agent handoff is deferred
- Mobile-accessible responsive layout for chat and artifact review on narrow screens

## What is implemented

- `app/page.tsx`: assistant-ui runtime bootstrapping
- `app/api/chat/route.ts`: single-route streaming chat endpoint
- `components/`: chat shell, artifact panel, pipeline bar, and tool UIs
- `lib/tools.ts`: structured tools used by the model
- `lib/agents.ts`: agent configs plus the merged MVP system prompt
- `lib/types.ts`: shared types for artifacts and pipeline events
- `lib/useReqAgentRuntime.ts`: local assistant-ui runtime bridge for the AI SDK data stream
- `workspace/uploads` and `workspace/outputs`: local directories reserved for future persistence

## MVP tradeoffs

This version deliberately does not implement true multi-agent handoff. The spec recommends `streamText + tools` for MVP validation, so the runtime uses one streamed model call and a strong phase-aware system prompt. The `@openai/agents` agent definitions are present to document the intended migration path.

The scaffold also uses a local runtime bridge in `lib/useReqAgentRuntime.ts` because the published `@assistant-ui/react-ai-sdk` package currently trips an export-path issue during Next.js builds. The app still uses assistant-ui plus the Vercel AI SDK data stream contract; the wrapper simply keeps the build runnable.

The UI also supports mobile web usage for the MVP: on narrow screens the main shell switches to a phone-friendly segmented view so the conversation/composer and artifact panel stay readable without relying on side-by-side desktop space.

## Run locally

ReqAgent reads its server-side OpenAI-compatible config from host environment variables.

Preferred variables:

- `OPENAI_API_KEY`: required for authenticated providers
- `OPENAI_BASE_URL`: optional; set this when targeting an OpenAI-compatible endpoint instead of the default OpenAI API
- `OPENAI_MODEL`: optional; defaults to `gpt-4o-mini`

You can export these in your shell, provide them via your process manager, or copy `.env.example` to `.env.local` for local-only convenience. `.env.local` is optional, not required.

1. Set `OPENAI_API_KEY` in your host environment, or create `.env.local` from `.env.example`
2. Install dependencies:

```bash
pnpm install
```

3. Start the app:

```bash
pnpm dev
```

4. Open `http://localhost:3000`

## Verify

```bash
pnpm typecheck
pnpm build
```

## Mobile responsiveness

- The MVP supports mobile web usage and adapts the main layout for narrow screens.
- On phones, the primary shell uses a conversation/artifacts toggle instead of the desktop split pane.
- The composer stacks vertically on small screens so prompt entry and send actions remain reachable.
- Artifact content stays available through the existing internal tabs (`Stories`, `SRS`, `Notes`).

Known limitations:

- Long generated markdown or dense story sets can still produce substantial vertical scrolling on smaller devices.
- This is responsive web support only; there is no native mobile packaging or install-specific optimization yet.

## Suggested prompt

```text
我想做一个在线教育平台，支持视频课程、直播教学、作业提交和批改。目标用户是 K12 学生和家长。
```

Expected flow:

1. ReqAgent may ask one or two clarifying questions
2. `parse_input` logs the parsed brief
3. `search_knowledge` returns a seeded reference pattern
4. `generate_stories` emits structured user stories
5. `generate_doc` returns the markdown requirement draft
