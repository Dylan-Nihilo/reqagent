"use client";

import { useThread } from "@assistant-ui/react";
import type { AgentActivity, ReqAgentMessageMeta } from "@/lib/types";

/**
 * Derives the current AgentActivity from thread state.
 *
 * Priority:
 *   Layer 2 — server-sent metadata (ReqAgentMessageMeta.agentActivity)
 *   Layer 1 — client-side inference from message parts
 */
export function useAgentActivity(): AgentActivity {
  return useThread((state) => {
    if (!state.isRunning) return "idle";

    const last = state.messages[state.messages.length - 1];
    if (!last || last.role !== "assistant") return "idle";

    // Layer 2: explicit server metadata
    const meta = (last.metadata as Record<string, unknown> | undefined)
      ?.custom as ReqAgentMessageMeta | undefined;
    if (meta?.agentActivity) return meta.agentActivity;

    // Layer 1: infer from message parts
    const parts = last.content;
    if (!parts || parts.length === 0) return "responding";

    const lastPart = parts[parts.length - 1];

    if (lastPart.type === "reasoning") return "thinking";
    if (lastPart.type === "tool-call" && !("result" in lastPart && lastPart.result !== undefined)) {
      return "tool_calling";
    }
    if (lastPart.type === "text") return "responding";

    return "responding";
  });
}
