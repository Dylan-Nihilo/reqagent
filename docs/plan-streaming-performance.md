# Plan: Streaming Performance Optimization

> Status: Ready for execution
> Priority: High — user-visible jank during AI responses
> Symptom: UI freezes/stutters when AI is working (long responses, tool calls, writing)

## Root Cause Analysis

During streaming, each text-delta chunk (20-50/sec) triggers a full render pipeline:

```
Server: text-delta chunk + messageMetadata (with full debug arrays)
    ↓ wire (serialize ~2-5KB per chunk)
Client: parse metadata → update message state → trigger re-renders
    ↓
ReqMessageMarkdownPreview: full markdown re-parse via react-markdown
    ↓
useArtifacts: scan ALL messages for tool-call parts
    ↓
React VDOM diff → DOM update
```

Each step is individually acceptable, but combined at 30+ FPS streaming rate they compound to cause jank.

## Tasks (ordered by impact)

### Task 1: Throttle Markdown rendering (highest impact)

**Problem**: `react-markdown` + `remarkGfm` does full AST parse → VDOM on every text-delta. A 2000-char response means parsing 2000 chars of markdown 30+ times per second near the end.

**File**: `components/message-ui/ReqMessageUI.tsx`

**Solution**: Throttle the markdown source update during streaming. The raw text accumulates in real-time, but the expensive `<Markdown>` component only re-renders at a capped rate.

```tsx
import { useRef, useState, useEffect, memo } from "react";

// Module-level constant — prevents react-markdown from re-initializing plugins
const REMARK_PLUGINS = [remarkGfm];

export const ReqMessageMarkdownPreview = memo(function ReqMessageMarkdownPreview({
  markdown,
  streaming = false,
}: {
  markdown: string;
  streaming?: boolean;
}) {
  const throttled = useThrottledValue(markdown, streaming ? 80 : 0);
  const source = streaming ? `${throttled}\u200B` : throttled;

  return (
    <div className={`${styles.richText} ${streaming ? styles.richTextStreaming : ""}`}>
      <Markdown remarkPlugins={REMARK_PLUGINS}>{source}</Markdown>
    </div>
  );
});
```

**Create `useThrottledValue` hook** (in the same file or `lib/hooks.ts`):

```tsx
function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdateRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (intervalMs <= 0) {
      setThrottled(value);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= intervalMs) {
      // Enough time has passed — update immediately
      lastUpdateRef.current = now;
      setThrottled(value);
    } else {
      // Schedule a trailing update
      if (pendingRef.current) clearTimeout(pendingRef.current);
      pendingRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThrottled(value);
        pendingRef.current = null;
      }, intervalMs - elapsed);
    }

    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [value, intervalMs]);

  // Always flush the final value when streaming stops
  useEffect(() => {
    if (intervalMs === 0) setThrottled(value);
  }, [intervalMs, value]);

  return throttled;
}
```

**Why 80ms**: 80ms ≈ 12.5 renders/sec. Human eye perceives smooth text at ~10-15 updates/sec. Below 60ms the markdown parsing overhead dominates; above 120ms text feels laggy.

**Key details**:
- `memo()` wraps the component to skip re-renders when props haven't changed
- `REMARK_PLUGINS` is a module-level constant — prevents `react-markdown` from re-initializing its unified processor on every render (this alone can save 20-30% of parse time)
- Trailing update ensures the final chunk always renders (no lost content)
- When `streaming` becomes `false`, throttle drops to 0 → immediate final render

### Task 2: Strip debug payload from per-delta metadata (high impact)

**Problem**: `messageMetadata` callback in `route.ts` sends full debug arrays on EVERY stream chunk:
- `debugEvents` array (up to 48 entries)
- `debugSteps` array (up to 12 entries)
- `toolInvocationStates` object

This means ~2-5KB of JSON serialized and deserialized 30+ times per second.

**File**: `app/api/chat/route.ts`, lines 646-718

**Solution**: Only include debug data in step-boundary chunks, not every text-delta.

Replace the current `messageMetadata` callback:

```tsx
messageMetadata: ({ part }) => {
  const chunk = part as { /* ... existing type cast ... */ };

  // --- Lightweight event tracking (keep) ---
  const event = {
    index: ++debugEventIndex,
    type: part.type,
    id: chunk.id,
    toolCallId: chunk.toolCallId ?? chunk.toolCall?.toolCallId,
    preliminary: chunk.preliminary,
  };
  debugEvents.push(event);
  if (debugEvents.length > 48) debugEvents.shift();

  // --- Tool state tracking (keep, it's small) ---
  const withToolState = (toolCallId: string, state: ToolInvocationViewState, phaseLabel: string) => {
    toolInvocationStates[toolCallId] = state;
    return {
      custom: {
        model: providerInfo.model,
        wireApi: providerInfo.wireApi,
        agentActivity: "tool_calling" as const,
        phaseLabel,
        toolInvocationStates: { ...toolInvocationStates },
      },
    };
  };

  // --- Per-chunk metadata: SLIM version (no debug arrays) ---
  const slimPayload = {
    model: providerInfo.model,
    wireApi: providerInfo.wireApi,
  };

  switch (chunk.type) {
    // Tool chunks: include tool state (small, needed for UI)
    case "tool-input-start":
      return withToolState(chunk.toolCallId ?? chunk.id ?? "unknown", "drafting_input", "组装参数");
    case "tool-input-available":
      return withToolState(chunk.toolCallId ?? chunk.id ?? "unknown", "input_ready", "工具调用");
    case "tool-approval-request":
      return withToolState(chunk.toolCall?.toolCallId ?? chunk.toolCallId ?? "unknown", "awaiting_approval", "等待批准");
    case "tool-output-available":
      return withToolState(chunk.toolCallId ?? "unknown", chunk.preliminary ? "streaming_output" : "succeeded", chunk.preliminary ? "输出流" : "工具完成");
    case "tool-error":
      return withToolState(chunk.toolCallId ?? "unknown", "failed", "工具失败");
    case "tool-output-denied":
      return withToolState(chunk.toolCallId ?? "unknown", "denied", "已拒绝");

    // Text/reasoning chunks: minimal metadata, NO debug arrays
    case "text-start":
    case "text-delta":
      return { custom: { ...slimPayload, agentActivity: "responding" } };
    case "reasoning-start":
    case "reasoning-delta":
      return { custom: { ...slimPayload, agentActivity: "thinking" } };

    default:
      return { custom: { ...slimPayload, agentActivity: "responding" } };
  }
},
```

**What was removed from text-delta chunks**:
- `debug.events` (up to 48 entries) — only useful for debug panel, not needed per-delta
- `debug.steps` (up to 12 entries) — same
- `debug.threadId/workspaceId/etc` — static per request, doesn't change per chunk
- `toolInvocationStates` — not needed on text chunks (only on tool chunks)
- `activeRole`, `publicThinking` — unused fields

**Optional**: If debug panel is still needed, expose a separate `GET /api/debug/[threadId]` endpoint that returns the accumulated debug data on-demand, rather than streaming it inline.

### Task 3: Stabilize useArtifacts reference (medium impact)

**Problem**: `useArtifacts()` calls `useThread((state) => state.messages)`. During streaming, the `messages` array reference changes on every delta (new content appended), causing `useMemo(() => deriveArtifacts(messages), [messages])` to re-run. `deriveArtifacts` iterates ALL messages × ALL parts on every update.

**File**: `lib/use-artifacts.ts`

**Solution A (simpler)**: Only recompute artifacts when a tool-call part actually completes or starts — not on text deltas. Use a stable fingerprint:

```tsx
export function useArtifacts(): ArtifactCollection {
  const fingerprint = useThread((state) => {
    // Build a cheap fingerprint from tool-call parts only
    // This only changes when tool calls change, not on text deltas
    let fp = "";
    for (const msg of state.messages) {
      if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
      for (const part of msg.content) {
        if (part && typeof part === "object" && (part as any).type === "tool-call") {
          const tc = part as any;
          const statusType = tc.status?.type ?? "unknown";
          fp += `${tc.toolCallId}:${statusType};`;
        }
      }
    }
    return fp;
  });

  const messages = useThread((state) => state.messages);

  return useMemo(
    () => deriveArtifacts(messages as readonly ThreadMessageLike[]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fingerprint],  // Only recompute when tool-call status changes
  );
}
```

**Why this works**: During text streaming, no tool-call parts are changing, so `fingerprint` stays the same → `useMemo` returns cached result. When a tool call starts or completes, fingerprint changes → recompute.

**Solution B (if Solution A causes stale data)**: Keep current approach but throttle:

```tsx
export function useArtifacts(): ArtifactCollection {
  const messages = useThread((state) => state.messages);
  const [artifacts, setArtifacts] = useState<ArtifactCollection>({ items: [], pending: null });
  const lastComputeRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastComputeRef.current < 500) return; // Max 2 computations/sec
    lastComputeRef.current = now;
    setArtifacts(deriveArtifacts(messages as readonly ThreadMessageLike[]));
  }, [messages]);

  return artifacts;
}
```

Recommend starting with **Solution A** — it's more correct and doesn't lose reactivity.

### Task 4: Memo-guard AssistantMessage sub-tree (medium impact)

**Problem**: `AssistantMessage` in `ReqAgentUI.tsx` reads metadata via `useMessage((s) => s.metadata)`. During streaming, metadata changes on every chunk (even with Task 2's slimmed payload), causing the entire message sub-tree to re-render.

**File**: `components/ReqAgentUI.tsx`, `AssistantMessage` function (around line 298)

**Solution**: Extract the metadata-dependent UI (status pill, pending copy) into a separate memoized component, so the heavy `<MessagePrimitive.Parts>` doesn't re-render when only metadata changes.

```tsx
function AssistantMessage() {
  const status = useMessage((s) => s.status as MessageStatus);
  const content = useMessage((s) => s.content);
  const messageId = useMessage((s) => s.id);
  const isCancelled = useIsMessageCancelled(messageId);

  const rawVisualStatus = resolveMessageVisualStatus(status, content);
  const visualStatus = isCancelled && rawVisualStatus === "complete" ? "cancelled" as const : rawVisualStatus;

  return (
    <MessagePrimitive.Root>
      <ReqMessage
        role="assistant"
        status={visualStatus}
      >
        {visualStatus === "pending" ? (
          <AssistantPendingIndicator />
        ) : null}
        <MessagePrimitive.Parts components={assistantPartComponents} />
        <AssistantMessageMeta />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}

// Isolated: only re-renders when metadata changes, doesn't touch Parts
function AssistantMessageMeta() {
  const rawMetadata = useMessage((s) => s.metadata);
  const timing = useMessageTiming();
  const metaObj = rawMetadata as Record<string, unknown> | undefined;
  const meta = metaObj?.custom as ReqAgentMessageMeta | undefined;
  const signals = buildAssistantSignals({ timing });

  // Return null or a lightweight meta display
  // The key point: this component is SEPARATE from the Parts tree
  return null; // or <span className={styles.meta}>{meta?.model}</span> if you want to show it
}

function AssistantPendingIndicator() {
  const rawMetadata = useMessage((s) => s.metadata);
  const content = useMessage((s) => s.content);
  const metaObj = rawMetadata as Record<string, unknown> | undefined;
  const meta = metaObj?.custom as ReqAgentMessageMeta | undefined;
  const pendingCopy = resolvePendingCopy(meta, content);

  return (
    <ReqStreamingIndicator
      label={pendingCopy.label}
      phases={pendingCopy.phases}
    />
  );
}
```

**Why this matters**: Currently, when metadata changes (every chunk), the entire `AssistantMessage` re-renders including `<MessagePrimitive.Parts>` which contains the expensive `<Markdown>` component. By isolating metadata reads into leaf components, the Parts tree only re-renders when `content` actually changes.

### Task 5: Stabilize remarkPlugins and component references (low impact, easy win)

**Problem**: Multiple small reference instability issues:

1. `remarkPlugins={[remarkGfm]}` — new array every render
2. `assistantPartComponents` and `userPartComponents` in `part-registry.tsx` — already module-level constants (good!)
3. `buildAssistantSignals` returns a new array every call

**File**: `components/message-ui/ReqMessageUI.tsx`, `components/ReqAgentUI.tsx`

**Changes**:

```tsx
// ReqMessageUI.tsx — module level
const REMARK_PLUGINS = [remarkGfm];
// Use REMARK_PLUGINS in ReqMessageMarkdownPreview (see Task 1)
```

```tsx
// ReqAgentUI.tsx — stabilize signals
function buildAssistantSignals({ timing }: { timing?: ... }) {
  // Already returns undefined when empty — good
  // But creates new array each time when non-empty
  // This is minor since it only affects the footer, not the heavy markdown
  // Leave as-is unless profiling shows it matters
}
```

### Task 6: Consider virtualization for long threads (low priority, future)

If threads grow beyond ~50 messages, the DOM node count becomes a factor. `ThreadPrimitive.Viewport` from `@assistant-ui/react` may or may not virtualize internally.

**Skip for now** — only relevant for very long conversations. Profile first before adding complexity.

## Execution Order

```
Task 1 (throttle markdown)  ← Highest impact, do first
    ↓
Task 2 (slim metadata)      ← Second highest, reduces wire + parse overhead
    ↓
Task 3 (stabilize artifacts) ← Prevents unnecessary computation during text streaming
    ↓
Task 4 (memo AssistantMessage) ← Prevents cascade re-renders
    ↓
Task 5 (reference stability) ← Quick wins, can be done alongside Task 1
```

Tasks 1 and 2 are independent — can be done in parallel.
Tasks 3 and 4 are independent — can be done in parallel.
Task 5 is a detail of Task 1.

## Files Modified

| File | Task | Change |
|------|------|--------|
| `components/message-ui/ReqMessageUI.tsx` | 1, 5 | Throttled markdown, memo, stable plugins |
| `app/api/chat/route.ts` | 2 | Slim messageMetadata for text chunks |
| `lib/use-artifacts.ts` | 3 | Fingerprint-based recomputation |
| `components/ReqAgentUI.tsx` | 4 | Split AssistantMessage into leaf components |

## Do NOT Change

- `lib/part-registry.tsx` — already uses module-level constants, no issue here
- `components/ReqComposer.tsx` — ComposerSendButton already extracted (per MEMORY.md)
- `components/ReqStreamingIndicator.tsx` — thin wrapper, not a bottleneck
- Thread persistence / API routes — unrelated to rendering
- CSS animations (pulse, fadeUp) — these are GPU-accelerated, not causing jank

## Verification

1. `pnpm typecheck` passes after each task
2. Start dev server, send a message that triggers a long response (e.g. "写一份电商平台的需求分析，尽量详细")
3. Open Chrome DevTools → Performance tab → record during streaming
4. Check:
   - Frame rate stays above 30fps during streaming (currently likely dropping to 5-10fps)
   - No layout thrashing (forced reflows)
   - React Profiler shows markdown component rendering at ~12fps instead of 30+fps
5. Verify final content renders completely (no lost trailing text)
6. Verify tool call UI still works (approval cards, progress indicators)

## Expected Impact

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| Markdown renders/sec | 30-50 | 12 (throttled) |
| Metadata payload/chunk | 2-5 KB | 50-100 bytes (text chunks) |
| Artifact recomputation | Every delta | Only on tool-call changes |
| Perceived jank | Noticeable stutter | Smooth streaming |
