// Hook system — programmable interceptors at agent loop lifecycle points.

import type { AgentLoopConfig, AgentLoopState } from "./agent-loop";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HookEvent =
  | "pre_tool_use"
  | "post_tool_use"
  | "step_start"
  | "step_finish"
  | "loop_start"
  | "loop_end";

export type HookContext = {
  event: string;
  step: number;
  toolName?: string;
  toolInput?: unknown;
  toolCallId?: string;
  toolResult?: unknown;
  loopState: Readonly<AgentLoopState>;
  loopConfig: Readonly<AgentLoopConfig>;
};

export type HookResult =
  | { action: "allow" }
  | { action: "deny"; reason: string }
  | { action: "modify"; input: unknown }
  | { action: "inject_feedback"; message: string };

export type HookHandler = (ctx: HookContext) => Promise<HookResult>;

export type HookRegistration = {
  id: string;
  event: HookEvent;
  handler: HookHandler;
  priority: number;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

let nextHookId = 1;

export class HookRegistry {
  private hooks: HookRegistration[] = [];

  register(event: HookEvent, handler: HookHandler, priority = 100): string {
    const id = `hook_${nextHookId++}`;
    this.hooks.push({ id, event, handler, priority });
    // Sort by priority ascending (lower = runs first)
    this.hooks.sort((a, b) => a.priority - b.priority);
    return id;
  }

  unregister(hookId: string): boolean {
    const idx = this.hooks.findIndex((h) => h.id === hookId);
    if (idx === -1) return false;
    this.hooks.splice(idx, 1);
    return true;
  }

  /**
   * Execute all hooks for the given event in priority order.
   * Short-circuits on "deny" — no subsequent hooks run.
   * "modify" updates the context input for subsequent hooks.
   * Returns the final result (defaults to "allow").
   */
  async execute(event: string, ctx: HookContext): Promise<HookResult> {
    const matching = this.hooks.filter((h) => h.event === event);
    if (matching.length === 0) return { action: "allow" };

    let currentCtx = ctx;

    for (const hook of matching) {
      try {
        const result = await hook.handler(currentCtx);

        if (result.action === "deny") {
          return result;
        }

        if (result.action === "modify" && result.input !== undefined) {
          currentCtx = { ...currentCtx, toolInput: result.input };
        }

        if (result.action === "inject_feedback") {
          // Feedback hooks don't block — they just annotate.
          // The caller can inspect the result chain.
          return result;
        }
      } catch (error) {
        console.error(`[ReqAgent hook] ${hook.id} threw:`, error);
        // Hook errors don't block the loop — they're logged and skipped.
      }
    }

    return { action: "allow" };
  }

  /** Get all registered hooks (read-only). */
  list(): ReadonlyArray<HookRegistration> {
    return this.hooks;
  }

  /** Count hooks for a specific event. */
  count(event?: HookEvent): number {
    if (!event) return this.hooks.length;
    return this.hooks.filter((h) => h.event === event).length;
  }
}
