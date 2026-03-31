// Built-in hooks — RiskGate, Audit, Budget.
// These are registered into a HookRegistry by the harness setup.

import type { HookHandler, HookContext, HookResult, HookRegistry } from "./hooks";
import { PermissionPolicy, DEFAULT_PERMISSION_RULES } from "./permissions";
import { getToolRegistryItem } from "@/lib/tool-registry";
import { appendChatTrace } from "@/lib/chat-trace";

// ---------------------------------------------------------------------------
// RiskGateHook — pre_tool_use: check permission policy
// ---------------------------------------------------------------------------

export function createRiskGateHook(policy?: PermissionPolicy): HookHandler {
  const permissionPolicy = policy ?? new PermissionPolicy(DEFAULT_PERMISSION_RULES);

  return async (ctx: HookContext): Promise<HookResult> => {
    if (!ctx.toolName) return { action: "allow" };

    const meta = getToolRegistryItem(ctx.toolName) ?? null;
    const decision = permissionPolicy.evaluate(ctx.toolName, ctx.toolInput, meta);

    if (decision.action === "deny") {
      return { action: "deny", reason: `Permission policy denied tool: ${ctx.toolName}` };
    }

    // "ask" means the tool needs approval — we don't block here, but the
    // agent-loop can inspect the decision via the hook result chain.
    // The actual approval UI is handled by the existing SDK interrupt flow.
    return { action: "allow" };
  };
}

// ---------------------------------------------------------------------------
// AuditHook — post_tool_use: record tool execution to chat trace
// ---------------------------------------------------------------------------

export type AuditHookOptions = {
  traceContext?: {
    threadId: string;
    threadKey: string;
    workspaceId: string;
    workspaceKey: string;
  };
};

export function createAuditHook(options?: AuditHookOptions): HookHandler {
  return async (ctx: HookContext): Promise<HookResult> => {
    if (!options?.traceContext) return { action: "allow" };

    void appendChatTrace(options.traceContext, "hook.audit", {
      hookEvent: ctx.event,
      step: ctx.step,
      toolName: ctx.toolName,
      toolCallId: ctx.toolCallId,
      hasResult: ctx.toolResult !== undefined,
    }).catch((error) => {
      console.error("[ReqAgent audit hook] trace write failed:", error);
    });

    return { action: "allow" };
  };
}

// ---------------------------------------------------------------------------
// BudgetHook — step_finish: check step count and token budget
// ---------------------------------------------------------------------------

export type BudgetHookOptions = {
  maxSteps?: number;
  maxTokens?: number;
  currentTokenEstimate?: () => number;
};

export function createBudgetHook(options?: BudgetHookOptions): HookHandler {
  return async (ctx: HookContext): Promise<HookResult> => {
    const stepLimit = options?.maxSteps ?? ctx.loopConfig.maxSteps;
    if (ctx.step >= stepLimit) {
      return {
        action: "inject_feedback",
        message: `Step budget exhausted (${ctx.step}/${stepLimit}). Consider wrapping up.`,
      };
    }

    if (options?.maxTokens && options.currentTokenEstimate) {
      const estimate = options.currentTokenEstimate();
      if (estimate > options.maxTokens) {
        return {
          action: "inject_feedback",
          message: `Token budget exceeded (${estimate}/${options.maxTokens}). Consider compacting context.`,
        };
      }
    }

    return { action: "allow" };
  };
}

// ---------------------------------------------------------------------------
// Registration helper
// ---------------------------------------------------------------------------

export type BuiltinHookSetup = {
  policy?: PermissionPolicy;
  audit?: AuditHookOptions;
  budget?: BudgetHookOptions;
};

export function registerBuiltinHooks(
  registry: HookRegistry,
  setup?: BuiltinHookSetup,
): string[] {
  const ids: string[] = [];

  ids.push(registry.register("pre_tool_use", createRiskGateHook(setup?.policy), 10));
  ids.push(registry.register("post_tool_use", createAuditHook(setup?.audit), 50));
  ids.push(registry.register("step_finish", createBudgetHook(setup?.budget), 50));

  return ids;
}
