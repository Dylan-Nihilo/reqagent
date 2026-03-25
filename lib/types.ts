import type { UIMessage } from "ai";
import { z } from "zod";
import type { ReqAgentProviderInfo } from "@/lib/ai-provider";
import type { ReqAgentMcpServerStatus } from "@/lib/mcp";

export type StoryPriority = "must" | "should" | "could";

export type StructuredRequirement = {
  projectName: string;
  rawSummary: string;
  entities: string[];
  targetUsers: string[];
  coreFeatures: string[];
  constraints: string[];
  ambiguities: string[];
};

export type UserStory = {
  id: string;
  role: string;
  want: string;
  soThat: string;
  priority: StoryPriority;
  acceptanceCriteria: string[];
};

export type StoryGenerationResult = {
  projectName: string;
  total: number;
  stories: UserStory[];
  summary: Record<StoryPriority, number>;
};

export type DocumentGenerationResult = {
  projectName: string;
  format: "markdown";
  content: string;
  charCount: number;
};

export type KnowledgeSearchResult = {
  source: string;
  pattern: string;
  relevance: number;
};

export type ReqAgentRole = "Orchestrator" | "InputParser" | "ReqDecomposer" | "DocGenerator";
export type ReqAgentStage = "clarify" | "parse" | "decompose" | "document";
export type ReqAgentStageStatus = "idle" | "running" | "complete" | "failed" | "awaiting_input";
export type ReqAgentWorkflowStatus = "idle" | "running" | "awaiting_input" | "completed" | "failed";
export type ReqAgentToolStatus = "running" | "complete" | "incomplete";
export type ReqAgentErrorKind =
  | "provider_network"
  | "provider_protocol"
  | "invalid_json"
  | "schema_validation"
  | "internal_error";

export type ReqAgentPipeline = Record<ReqAgentStage, ReqAgentStageStatus>;

export type ReqAgentArtifacts = {
  brief?: StructuredRequirement;
  stories?: StoryGenerationResult;
  doc?: DocumentGenerationResult;
};

export type ReqAgentThreadState = {
  runId: string;
  workflowStatus: ReqAgentWorkflowStatus;
  activeStage: ReqAgentStage | null;
  activeRole: ReqAgentRole | null;
  publicThinking: string;
  threadTitle: string;
  pipeline: ReqAgentPipeline;
  artifacts: ReqAgentArtifacts;
  errorKind?: ReqAgentErrorKind;
  errorMessage?: string;
  providerInfo?: ReqAgentProviderInfo;
};

export type ReqAgentUIMessage = UIMessage<ReqAgentThreadState>;

export const structuredRequirementSchema = z.object({
  projectName: z.string(),
  rawSummary: z.string(),
  entities: z.array(z.string()),
  targetUsers: z.array(z.string()),
  coreFeatures: z.array(z.string()),
  constraints: z.array(z.string()),
  ambiguities: z.array(z.string()),
});

export const userStorySchema = z.object({
  id: z.string(),
  role: z.string(),
  want: z.string(),
  soThat: z.string(),
  priority: z.enum(["must", "should", "could"]),
  acceptanceCriteria: z.array(z.string()),
});

export const storyGenerationResultSchema = z.object({
  projectName: z.string(),
  total: z.number().int().nonnegative(),
  stories: z.array(userStorySchema),
  summary: z.object({
    must: z.number().int().nonnegative(),
    should: z.number().int().nonnegative(),
    could: z.number().int().nonnegative(),
  }),
});

export const documentGenerationResultSchema = z.object({
  projectName: z.string(),
  format: z.literal("markdown"),
  content: z.string(),
  charCount: z.number().int().nonnegative(),
});

export const reqAgentStageOrder = ["clarify", "parse", "decompose", "document"] as const satisfies readonly ReqAgentStage[];

export const reqAgentRoleOrder = ["Orchestrator", "InputParser", "ReqDecomposer", "DocGenerator"] as const satisfies readonly ReqAgentRole[];

export const reqAgentStageLabels: Record<ReqAgentStage, string> = {
  clarify: "澄清需求",
  parse: "解析输入",
  decompose: "拆解需求",
  document: "生成文档",
};

export const reqAgentPipelineSchema = z.object({
  clarify: z.enum(["idle", "running", "complete", "failed", "awaiting_input"]),
  parse: z.enum(["idle", "running", "complete", "failed", "awaiting_input"]),
  decompose: z.enum(["idle", "running", "complete", "failed", "awaiting_input"]),
  document: z.enum(["idle", "running", "complete", "failed", "awaiting_input"]),
});

export const reqAgentArtifactsSchema = z.object({
  brief: structuredRequirementSchema.optional(),
  stories: storyGenerationResultSchema.optional(),
  doc: documentGenerationResultSchema.optional(),
});

export const reqAgentProviderInfoSchema = z.object({
  providerName: z.string(),
  model: z.string(),
  wireApi: z.enum(["chat-completions", "responses"]),
});

export const reqAgentThreadStateSchema = z.object({
  runId: z.string(),
  workflowStatus: z.enum(["idle", "running", "awaiting_input", "completed", "failed"]),
  activeStage: z.enum(["clarify", "parse", "decompose", "document"]).nullable(),
  activeRole: z.enum(["Orchestrator", "InputParser", "ReqDecomposer", "DocGenerator"]).nullable(),
  publicThinking: z.string(),
  threadTitle: z.string(),
  pipeline: reqAgentPipelineSchema,
  artifacts: reqAgentArtifactsSchema,
  errorKind: z.enum(["provider_network", "provider_protocol", "invalid_json", "schema_validation", "internal_error"]).optional(),
  errorMessage: z.string().optional(),
  providerInfo: reqAgentProviderInfoSchema.optional(),
});

export function createReqAgentPipeline(): ReqAgentPipeline {
  return {
    clarify: "idle",
    parse: "idle",
    decompose: "idle",
    document: "idle",
  };
}

export function createReqAgentThreadState(overrides: Partial<ReqAgentThreadState> = {}): ReqAgentThreadState {
  return {
    runId: overrides.runId ?? "idle",
    workflowStatus: overrides.workflowStatus ?? "idle",
    activeStage: overrides.activeStage ?? null,
    activeRole: overrides.activeRole ?? null,
    publicThinking: overrides.publicThinking ?? "",
    threadTitle: overrides.threadTitle ?? "当前会话",
    pipeline: overrides.pipeline ?? createReqAgentPipeline(),
    artifacts: overrides.artifacts ?? {},
    errorKind: overrides.errorKind,
    errorMessage: overrides.errorMessage,
    providerInfo: overrides.providerInfo,
  };
}

export function safeParseReqAgentThreadState(value: unknown): ReqAgentThreadState | null {
  const parsed = reqAgentThreadStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function getLatestReqAgentThreadState(messages: ReadonlyArray<{ role?: string; metadata?: unknown }>): ReqAgentThreadState | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role !== "assistant") {
      continue;
    }

    const parsed = safeParseReqAgentThreadState(message.metadata);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

export function normalizeToolStatus(status: { type: string }): ReqAgentToolStatus {
  switch (status.type) {
    case "running":
    case "requires-action":
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return "running";
    case "output-error":
    case "output-denied":
    case "incomplete":
      return "incomplete";
    default:
      return "complete";
  }
}

// ---------------------------------------------------------------------------
// Agent activity & execution state types
// ---------------------------------------------------------------------------

/** High-level agent activity — what the agent is doing right now. */
export type AgentActivity =
  | "idle"
  | "thinking"
  | "responding"
  | "tool_calling"
  | "reading"
  | "searching"
  | "handoff"
  | "error";

/** Frontend-facing lifecycle for tool invocation rendering. */
export type ToolInvocationViewState =
  | "drafting_input"
  | "input_ready"
  | "input_invalid"
  | "awaiting_approval"
  | "executing"
  | "streaming_output"
  | "succeeded"
  | "denied"
  | "failed";

/** @deprecated Use ToolInvocationViewState instead. */
export type ToolExecutionState = ToolInvocationViewState;

/** MCP connection lifecycle (reserved for future use). */
export type McpConnectionState =
  | "idle"
  | "connecting"
  | "calling"
  | "streaming"
  | "complete"
  | "error";

export type ReqAgentDebugEvent = {
  index: number;
  type: string;
  id?: string;
  toolCallId?: string;
  preliminary?: boolean;
};

export type ReqAgentDebugStep = {
  index: number;
  finishReason: string;
  textPreview?: string;
  toolCalls: Array<{
    toolName: string;
    input?: unknown;
  }>;
  toolResults: Array<{
    toolName: string;
    outputPreview: string;
  }>;
};

export type ReqAgentDebugMeta = {
  threadId?: string;
  threadKey?: string;
  workspaceId?: string;
  workspaceKey?: string;
  workspaceDir?: string;
  mcpServers?: ReqAgentMcpServerStatus[];
  lastEvent?: ReqAgentDebugEvent;
  events?: ReqAgentDebugEvent[];
  steps?: ReqAgentDebugStep[];
};

/**
 * Server-sent metadata envelope — attached to each assistant message via
 * `toUIMessageStreamResponse({ messageMetadata })`.
 */
export type ReqAgentMessageMeta = {
  agentActivity: AgentActivity;
  activeRole: ReqAgentRole | null;
  phaseLabel: string;
  publicThinking: string;
  model?: string;
  wireApi?: ReqAgentProviderInfo["wireApi"];
  toolInvocationStates?: Record<string, ToolInvocationViewState>;
  debug?: ReqAgentDebugMeta;
};

// ---------------------------------------------------------------------------
// State conversion helpers
// ---------------------------------------------------------------------------

export function parseToolArgsText(argsText: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(argsText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function resolveToolInvocationViewState({
  argsText,
  isError,
  interrupt,
  metadata,
  result,
  status,
  toolCallId,
}: {
  toolCallId: string;
  status: { type: string };
  argsText?: string;
  result?: unknown;
  isError?: boolean;
  interrupt?: unknown;
  metadata?: ReqAgentMessageMeta | null;
}): ToolInvocationViewState {
  // Live interrupt always wins — metadata may be stale from an earlier stream chunk
  if (interrupt || status.type === "requires-action") {
    return "awaiting_approval";
  }

  if (status.type === "incomplete" || isError) {
    return "failed";
  }

  // Props-based terminal states take precedence over metadata — props come
  // directly from the SDK converter and are ground truth, while metadata
  // travels a longer async path and can be stale.
  if (result !== undefined) {
    return "succeeded";
  }

  const metadataState = metadata?.toolInvocationStates?.[toolCallId];
  if (metadataState) {
    return metadataState;
  }

  if (!argsText) {
    return "drafting_input";
  }

  return parseToolArgsText(argsText) ? "executing" : "drafting_input";
}

/** Convert ToolInvocationViewState → compact visual status. */
export function toolInvocationToToolStatus(state: ToolInvocationViewState): ReqAgentToolStatus {
  switch (state) {
    case "drafting_input":
    case "input_ready":
    case "awaiting_approval":
    case "executing":
    case "streaming_output":
      return "running";
    case "succeeded":
      return "complete";
    case "input_invalid":
    case "denied":
    case "failed":
      return "incomplete";
  }
}
