import { z } from "zod";
import type {
  DocumentGenerationResult,
  KnowledgeSearchResult,
  StoryGenerationResult,
  StoryPriority,
  StructuredRequirement,
  UserStory,
} from "@/lib/types";

export const reqAgentToolNames = {
  parseInput: "parse_input",
  searchKnowledge: "search_knowledge",
  generateStories: "generate_stories",
  generateDoc: "generate_doc",
} as const;

export const parseResultSchema = z.object({
  projectName: z.string(),
  rawSummary: z.string(),
  entities: z.array(z.string()),
  targetUsers: z.array(z.string()),
  coreFeatures: z.array(z.string()),
  constraints: z.array(z.string()),
  ambiguities: z.array(z.string()),
});

export const generatedStoryDraftSchema = z.object({
  role: z.string(),
  want: z.string(),
  soThat: z.string(),
  acceptanceCriteria: z.array(z.string()).min(1),
});

export const generateStoriesSchema = z.object({
  projectName: z.string(),
  stories: z.array(generatedStoryDraftSchema).min(1),
});

const docSchema = z.object({
  projectName: z.string(),
  content: z.string(),
});

const knowledgePatterns: Record<string, string> = {
  education:
    "Education products typically need roles, course delivery, learning progress, assignments, feedback loops, and family or admin oversight.",
  ecommerce:
    "Ecommerce systems usually include catalog, checkout, payment, order status, promotions, and customer support workflows.",
  productivity:
    "Productivity SaaS patterns include workspace setup, permissions, task flows, notifications, reporting, and integrations.",
  fintech:
    "Fintech systems usually need account security, transaction history, compliance checks, risk controls, reconciliation, and notification flows.",
  default:
    "General SaaS patterns usually cover onboarding, user management, permissions, dashboards, notifications, and external integrations.",
};

export function detectProjectName(rawInput: string) {
  const cleaned = rawInput.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled Project";
  return cleaned.slice(0, 48);
}

export function detectDomain(text: string) {
  const source = text.toLowerCase();

  if (source.includes("教育") || source.includes("课程") || source.includes("student") || source.includes("teacher")) {
    return "education";
  }

  if (source.includes("商城") || source.includes("电商") || source.includes("ecommerce") || source.includes("buyer")) {
    return "ecommerce";
  }

  if (source.includes("workspace") || source.includes("任务") || source.includes("协作") || source.includes("productivity")) {
    return "productivity";
  }

  if (source.includes("支付") || source.includes("wallet") || source.includes("fintech") || source.includes("交易")) {
    return "fintech";
  }

  return "default";
}

function pickPriority(index: number, total: number): StoryPriority {
  if (index < Math.max(1, Math.floor(total * 0.34))) return "must";
  if (index < Math.max(2, Math.floor(total * 0.67))) return "should";
  return "could";
}

export function searchKnowledgePatterns(query: string, domain?: string): KnowledgeSearchResult {
  const sourceKey = (domain ?? query).toLowerCase();
  const key = Object.keys(knowledgePatterns).find((entry) => sourceKey.includes(entry)) ?? detectDomain(sourceKey);

  return {
    source: "seeded-pattern-library",
    pattern: knowledgePatterns[key] ?? knowledgePatterns.default,
    relevance: key === "default" ? 0.72 : 0.89,
  };
}

export function buildStoryGenerationResult(projectName: string, stories: Array<Omit<UserStory, "id" | "priority"> & Partial<Pick<UserStory, "id" | "priority">>>): StoryGenerationResult {
  const normalizedStories: UserStory[] = stories.map((story, index) => ({
    ...story,
    id: story.id || `US-${String(index + 1).padStart(3, "0")}`,
    priority: story.priority ?? pickPriority(index, stories.length),
  }));

  return {
    projectName,
    total: normalizedStories.length,
    stories: normalizedStories,
    summary: {
      must: normalizedStories.filter((story) => story.priority === "must").length,
      should: normalizedStories.filter((story) => story.priority === "should").length,
      could: normalizedStories.filter((story) => story.priority === "could").length,
    },
  };
}

export function buildDocumentGenerationResult(projectName: string, content: string): DocumentGenerationResult {
  return docSchema.parse({
    projectName,
    content,
  }) as DocumentGenerationResult & { charCount?: never };
}

export function withDocumentMetrics(projectName: string, content: string): DocumentGenerationResult {
  const result = buildDocumentGenerationResult(projectName, content);

  return {
    ...result,
    format: "markdown",
    charCount: content.length,
  };
}

export function summarizeRequirement(requirement: StructuredRequirement) {
  return [
    `项目：${requirement.projectName}`,
    `用户：${requirement.targetUsers.join("、") || "未指定"}`,
    `核心功能：${requirement.coreFeatures.join("；") || "未指定"}`,
    `约束：${requirement.constraints.join("；") || "未指定"}`,
  ].join("\n");
}
