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

export type ReqAgentPhase = "parse_input" | "search_knowledge" | "generate_stories" | "generate_doc";

export type ReqAgentPhaseStatus = "running" | "complete" | "incomplete";

export type PipelineState = Record<ReqAgentPhase, "idle" | "running" | "complete">;

export type ArtifactState = {
  activeTab: "stories" | "doc" | "notes";
  stories?: StoryGenerationResult;
  doc?: DocumentGenerationResult;
};

export type ReqAgentArtifactEvent =
  | { kind: "stories"; payload: StoryGenerationResult }
  | { kind: "doc"; payload: DocumentGenerationResult }
  | { kind: "phase"; tool: ReqAgentPhase; status: PipelineState[ReqAgentPhase] };

export function normalizeToolStatus(status: { type: string }): ReqAgentPhaseStatus {
  if (status.type === "running" || status.type === "requires-action") {
    return "running";
  }

  return "complete";
}
