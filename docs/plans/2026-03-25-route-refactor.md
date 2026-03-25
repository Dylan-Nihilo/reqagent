# Route.ts Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose `app/api/chat/route.ts` (1091 lines, 6 responsibilities) into focused modules so the route handler itself is ~80 lines of pure orchestration.

**Architecture:** Extract each responsibility into `lib/workspace/` sub-modules. The route imports and composes them. Zero behaviour changes — purely structural. Each task is independently verifiable with `pnpm typecheck`.

**Tech Stack:** TypeScript, Next.js App Router, Vercel AI SDK v6, execa, node:fs/promises

---

## Current responsibilities in route.ts

| Lines | Responsibility | Target module |
|-------|---------------|---------------|
| 28–131 | Path / workspace / key utilities | `lib/workspace/context.ts` |
| 131–248 | FS iteration helpers (glob, scoring) | `lib/workspace/fs-utils.ts` |
| 248–278 | Tool catalog (descriptions, categories) | `lib/workspace/tool-catalog.ts` |
| 278–396 | Shell execution + fetch_url | `lib/workspace/shell.ts` |
| 461–876 | Workspace tool definitions (6 tools) | `lib/workspace/workspace-tools.ts` |
| 995–1067 | Streaming metadata builder | `lib/workspace/streaming-metadata.ts` |
| 398–1091 | POST handler (orchestration) | stays in route.ts (~80 lines) |

---

## Task 1: Extract workspace context utilities

**Files:**
- Create: `lib/workspace/context.ts`
- Modify: `app/api/chat/route.ts`

**What to move:** `readNonEmptyString`, `summarizeMessagesForFallback`, `buildScopedKey`,
`isPathInsideRoot`, `resolveRuntimeContext`, `ensureWorkspaceDirectory`, `resolveWorkspacePath`,
`summarizeForDebug`, plus constants `REQAGENT_ROOT_DIR` / `WORKSPACES_ROOT_DIR`.

**Step 1: Create `lib/workspace/context.ts`**

Move all the above verbatim. Export each one. File header:
```ts
import path from "node:path";
import { createHash } from "node:crypto";
import { DEFAULT_WORKSPACE_ID } from "@/lib/threads";

export const REQAGENT_ROOT_DIR = path.join(process.cwd(), ".reqagent");
export const WORKSPACES_ROOT_DIR = path.join(REQAGENT_ROOT_DIR, "workspaces");

// ... all moved functions ...

export type RuntimeContext = ReturnType<typeof resolveRuntimeContext>;
```

**Step 2: Update route.ts imports**

Remove moved functions/constants. Add:
```ts
import {
  resolveRuntimeContext,
  ensureWorkspaceDirectory,
  resolveWorkspacePath,
  summarizeForDebug,
  WORKSPACES_ROOT_DIR,
  type RuntimeContext,
} from "@/lib/workspace/context";
```

**Step 3: Verify**
```bash
pnpm typecheck
```
Expected: no errors.

**Step 4: Commit**
```bash
git add lib/workspace/context.ts app/api/chat/route.ts
git commit -m "refactor: extract workspace context utilities to lib/workspace/context.ts"
```

---

## Task 2: Extract FS iteration helpers

**Files:**
- Create: `lib/workspace/fs-utils.ts`
- Modify: `app/api/chat/route.ts`

**What to move:** Types `WorkspaceListEntry`, `SearchWorkspaceMatch`, `ToolCategory`, `MountedToolInfo`;
constant `ALWAYS_IGNORED_ENTRY_NAMES`; functions `shouldSkipWorkspaceEntry`, `buildGlobMatcher`,
`compareWorkspaceEntries`, `scoreSearchMatch`.

**Step 1: Create `lib/workspace/fs-utils.ts`**

Move all verbatim, export each. No imports needed beyond `node:path` (if any).

**Step 2: Update route.ts**

```ts
import {
  shouldSkipWorkspaceEntry,
  buildGlobMatcher,
  compareWorkspaceEntries,
  scoreSearchMatch,
  type WorkspaceListEntry,
  type SearchWorkspaceMatch,
} from "@/lib/workspace/fs-utils";
```

**Step 3: Verify**
```bash
pnpm typecheck
```

**Step 4: Commit**
```bash
git add lib/workspace/fs-utils.ts app/api/chat/route.ts
git commit -m "refactor: extract FS iteration helpers to lib/workspace/fs-utils.ts"
```

---

## Task 3: Extract tool catalog

**Files:**
- Create: `lib/workspace/tool-catalog.ts`
- Modify: `app/api/chat/route.ts`

**What to move:** `TOOL_DESCRIPTIONS`, `ToolCategory` type, `MountedToolInfo` type,
`categorizeTool`, `getToolDescription`.

**Step 1: Create `lib/workspace/tool-catalog.ts`**

Move verbatim, export all.

**Step 2: Update route.ts**

```ts
import {
  categorizeTool,
  getToolDescription,
  TOOL_DESCRIPTIONS,
  type ToolCategory,
  type MountedToolInfo,
} from "@/lib/workspace/tool-catalog";
```

**Step 3: Verify + Commit**
```bash
pnpm typecheck
git add lib/workspace/tool-catalog.ts app/api/chat/route.ts
git commit -m "refactor: extract tool catalog to lib/workspace/tool-catalog.ts"
```

---

## Task 4: Extract shell execution

**Files:**
- Create: `lib/workspace/shell.ts`
- Modify: `app/api/chat/route.ts`

**What to move:** `truncateOutput`, `executeInWorkspace`, and the `fetch_url` tool definition.

**Step 1: Create `lib/workspace/shell.ts`**

```ts
import path from "node:path";
import { execa, ExecaError } from "execa";
import { tool, jsonSchema } from "ai";
import { resolveWorkspacePath, summarizeForDebug } from "@/lib/workspace/context";
import { TOOL_DESCRIPTIONS } from "@/lib/workspace/tool-catalog";
```

Export `truncateOutput`, `executeInWorkspace` verbatim.
Export `fetchUrlTool` as a const (fetch_url needs no runtime context):
```ts
export const fetchUrlTool = tool({ ... }); // move verbatim from route.ts
```

**Step 2: Update route.ts**

```ts
import { executeInWorkspace, fetchUrlTool } from "@/lib/workspace/shell";
```

In `workspaceTools`: replace `fetch_url: tool({...})` with `fetch_url: fetchUrlTool`.
Replace inline bash execute logic with `executeInWorkspace(...)` call.

**Step 3: Verify + Commit**
```bash
pnpm typecheck
git add lib/workspace/shell.ts app/api/chat/route.ts
git commit -m "refactor: extract shell execution and fetch_url to lib/workspace/shell.ts"
```

---

## Task 5: Extract workspace tool definitions

**Files:**
- Create: `lib/workspace/workspace-tools.ts`
- Modify: `app/api/chat/route.ts`

**What to move:** The entire `workspaceTools` object inline in POST (~415 lines):
`list_files`, `search_workspace`, `readFile`, `writeFile`, `bash`, `list_available_tools`.

**Step 1: Create `lib/workspace/workspace-tools.ts`**

Wrap in a factory (tools need runtime context at call time):

```ts
import { tool, jsonSchema } from "ai";
import type { RuntimeContext } from "@/lib/workspace/context";
import type { McpRuntime } from "@/lib/mcp";
import type { ToolInvocationViewState } from "@/lib/types";
import { resolveWorkspacePath, summarizeForDebug } from "@/lib/workspace/context";
import { shouldSkipWorkspaceEntry, buildGlobMatcher, compareWorkspaceEntries, scoreSearchMatch } from "@/lib/workspace/fs-utils";
import { categorizeTool, getToolDescription, TOOL_DESCRIPTIONS } from "@/lib/workspace/tool-catalog";
import { executeInWorkspace, fetchUrlTool } from "@/lib/workspace/shell";
import { getAvailableToolsResult } from "@/lib/tool-registry";

export function buildWorkspaceTools(
  runtimeContext: RuntimeContext,
  toolInvocationStates: Record<string, ToolInvocationViewState>,
  mcpRuntime: McpRuntime,
) {
  return {
    fetch_url: fetchUrlTool,
    list_files: tool({ ... }),      // move verbatim
    search_workspace: tool({ ... }),
    readFile: tool({ ... }),
    writeFile: tool({ ... }),
    bash: tool({ ... }),
    list_available_tools: tool({ ... }),
  };
}
```

Note: `list_available_tools` references `mcpRuntime.tools` — compute `mountedNames` inside the factory.

**Step 2: Update route.ts POST handler**

Replace the ~415-line inline block:
```ts
const toolInvocationStates: Record<string, ToolInvocationViewState> = {};
const workspaceTools = buildWorkspaceTools(runtimeContext, toolInvocationStates, mcpRuntime);
```

**Step 3: Verify + Commit**
```bash
pnpm typecheck
git add lib/workspace/workspace-tools.ts app/api/chat/route.ts
git commit -m "refactor: extract workspace tool definitions to lib/workspace/workspace-tools.ts"
```

---

## Task 6: Extract streaming metadata builder

**Files:**
- Create: `lib/workspace/streaming-metadata.ts`
- Modify: `app/api/chat/route.ts`, `lib/ai-provider.ts`

**What to move:** `debugEvents`, `debugSteps`, `debugEventIndex` state + the entire `messageMetadata` callback.

**Step 1: Export `ProviderInfo` type from `lib/ai-provider.ts`**

```ts
export type ProviderInfo = ReturnType<typeof getProviderInfo>;
```

**Step 2: Create `lib/workspace/streaming-metadata.ts`**

```ts
import type { ToolInvocationViewState } from "@/lib/types";
import type { RuntimeContext } from "@/lib/workspace/context";
import type { ProviderInfo } from "@/lib/ai-provider";

export function buildMetadataHandler(params: {
  runtimeContext: RuntimeContext;
  mcpServers: unknown;
  providerInfo: ProviderInfo;
  toolInvocationStates: Record<string, ToolInvocationViewState>;
}) {
  const debugEvents: Array<{
    index: number; type: string; id?: string;
    toolCallId?: string; preliminary?: boolean;
  }> = [];
  const debugSteps: unknown[] = [];
  let debugEventIndex = 0;

  return function messageMetadata({ part }: { part: unknown }) {
    // ... verbatim switch logic from route.ts ...
  };
}
```

**Step 3: Update route.ts**

Remove inline debug state + messageMetadata callback. Add:
```ts
import { buildMetadataHandler } from "@/lib/workspace/streaming-metadata";
import type { ProviderInfo } from "@/lib/ai-provider";
```

In POST:
```ts
const messageMetadata = buildMetadataHandler({
  runtimeContext,
  mcpServers: mcpRuntime.servers,
  providerInfo,
  toolInvocationStates,
});
```

**Step 4: Verify + Commit**
```bash
pnpm typecheck
git add lib/workspace/streaming-metadata.ts lib/ai-provider.ts app/api/chat/route.ts
git commit -m "refactor: extract streaming metadata builder to lib/workspace/streaming-metadata.ts"
```

---

## Final state

After all 6 tasks, `app/api/chat/route.ts` should be ~80-100 lines:

```ts
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { getProviderInfo, reqAgentModel } from "@/lib/ai-provider";
import { ensureThread, getThreadWorkspaceId, syncThreadUiMessages } from "@/lib/db/store";
import { buildMcpRuntime } from "@/lib/mcp";
import { resolveRuntimeContext, ensureWorkspaceDirectory } from "@/lib/workspace/context";
import { buildWorkspaceTools } from "@/lib/workspace/workspace-tools";
import { buildMetadataHandler } from "@/lib/workspace/streaming-metadata";
import type { ToolInvocationViewState } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  // 1. Parse + validate request
  // 2. resolveRuntimeContext → ensureWorkspaceDirectory
  // 3. buildMcpRuntime
  // 4. buildWorkspaceTools
  // 5. buildMetadataHandler
  // 6. streamText({ tools, messageMetadata, ... })
  // 7. return result.toDataStreamResponse()
}
```

## New file structure

```
lib/workspace/
  context.ts              # path utils, runtime context, workspace dir helpers
  fs-utils.ts             # glob matcher, entry scorer, FS traversal helpers
  tool-catalog.ts         # TOOL_DESCRIPTIONS, categorizeTool, getToolDescription
  shell.ts                # executeInWorkspace, truncateOutput, fetchUrlTool
  workspace-tools.ts      # buildWorkspaceTools() factory — all 6 tool definitions
  streaming-metadata.ts   # buildMetadataHandler() factory — debug state + switch
```

## Verification after all tasks

```bash
pnpm typecheck   # must pass
pnpm build       # must pass
# Send "测试工具" in UI to verify tool calls still work end-to-end
```
