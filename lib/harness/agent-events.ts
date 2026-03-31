// Agent event types for the harness lifecycle.
// These events flow from AgentLoopController to consumers (trace, metadata, hooks).

export type StepResult = {
  finishReason: string;
  text?: string;
  toolCalls: Array<{ toolName: string; toolCallId: string; input: unknown }>;
  toolResults: Array<{ toolCallId: string; toolName: string; output: unknown }>;
};

export type AgentEvent =
  | { type: "loop_start"; maxSteps: number; interruptible: boolean }
  | { type: "step_start"; step: number }
  | { type: "step_finish"; step: number; result: StepResult }
  | { type: "tool_call"; step: number; toolName: string; toolInput: unknown; toolCallId: string }
  | { type: "tool_result"; step: number; toolCallId: string; toolName: string; result: unknown }
  | { type: "approval_request"; step: number; toolCallId: string; tool: string; input: unknown }
  | { type: "interrupt"; step: number; reason: string }
  | { type: "compaction_trigger"; step: number; messageCount: number; tokenEstimate: number }
  | { type: "stream_text"; step: number; delta: string }
  | { type: "loop_end"; totalSteps: number; reason: "complete" | "max_steps" | "interrupted" | "error" };

export type AgentEventType = AgentEvent["type"];

/** Extract the event payload for a specific type. */
export type AgentEventOf<T extends AgentEventType> = Extract<AgentEvent, { type: T }>;
