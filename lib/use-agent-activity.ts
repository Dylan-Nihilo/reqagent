"use client";

import { useThread } from "@assistant-ui/react";
import { inferAgentActivityFromMessageParts } from "@/lib/message-parts";
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
    const activity = inferAgentActivityFromMessageParts(last.content);
    return activity ?? "responding";
  });
}
