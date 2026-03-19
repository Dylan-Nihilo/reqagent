"use client";

import { ReqToolCard } from "@/components/ReqToolCard";
import { normalizeToolExecutionState, toolExecutionToToolStatus } from "@/lib/types";

/**
 * Default fallback renderer for tool-call message parts.
 *
 * Registered as `components.tools.Fallback` in MessagePrimitive.Parts.
 * assistant-ui passes ToolCallMessagePartProps which uses `args` for input.
 * We accept both `args` and `result` to handle the full lifecycle.
 */
export function ReqToolCallPart(props: Record<string, unknown>) {
  const toolName = (props.toolName as string) ?? "unknown_tool";
  const args = (props.args ?? props.input ?? {}) as Record<string, unknown>;
  const result = props.result ?? props.output;
  const status = (props.status as { type: string }) ?? { type: "running" };

  const execState = normalizeToolExecutionState(status);
  const uiStatus = toolExecutionToToolStatus(execState);
  const metrics = extractMetrics(result);

  return (
    <ReqToolCard
      description={summarizeArgs(args)}
      metrics={metrics}
      name={toolName}
      status={uiStatus}
      summary={uiStatus === "running" ? `${toolName} 执行中……` : undefined}
    />
  );
}

/** Extract display metrics from a tool result object. */
function extractMetrics(result: unknown): Array<{ label: string; value: string }> {
  if (!result || typeof result !== "object") return [];

  const entries = Object.entries(result as Record<string, unknown>);
  return entries
    .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    .slice(0, 6)
    .map(([k, v]) => ({ label: k, value: String(v) }));
}

/** Build a one-line description from tool arguments. */
function summarizeArgs(args: Record<string, unknown>): string {
  const keys = Object.keys(args);
  if (keys.length === 0) return "No arguments.";
  const preview = keys.slice(0, 3).join(", ");
  return keys.length > 3 ? `${preview} +${keys.length - 3} more` : preview;
}
