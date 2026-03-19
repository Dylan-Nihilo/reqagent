import type { UIMessage } from "ai";
import { z } from "zod";
import type { ReqAgentProviderInfo } from "@/lib/provider-config";

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
  wireApi: z.literal("responses"),
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
