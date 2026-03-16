import { tool } from "ai";
import { z } from "zod";
import type {
  DocumentGenerationResult,
  KnowledgeSearchResult,
  StoryGenerationResult,
  StructuredRequirement,
  StoryPriority,
  UserStory,
} from "@/lib/types";

const parseOutputSchema = z.object({
  projectName: z.string(),
  rawSummary: z.string(),
  entities: z.array(z.string()),
  targetUsers: z.array(z.string()),
  coreFeatures: z.array(z.string()),
  constraints: z.array(z.string()),
  ambiguities: z.array(z.string()),
});

const storySchema = z.object({
  id: z.string().describe("Use US-001 style identifiers."),
  role: z.string(),
  want: z.string(),
  soThat: z.string(),
  priority: z.enum(["must", "should", "could"]),
  acceptanceCriteria: z.array(z.string().describe("Use Given / When / Then phrasing.")),
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
  default:
    "General SaaS patterns usually cover onboarding, user management, permissions, dashboards, notifications, and external integrations.",
};

function detectProjectName(rawInput: string) {
  const cleaned = rawInput.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Untitled Project";
  return cleaned.slice(0, 48);
}

function pickPriority(index: number, total: number): StoryPriority {
  if (index < Math.max(1, Math.floor(total * 0.34))) return "must";
  if (index < Math.max(2, Math.floor(total * 0.67))) return "should";
  return "could";
}

export const parseInputTool = tool({
  description: "Parse raw user input into a structured requirement brief.",
  parameters: z.object({
    raw_input: z.string().describe("The user's requirement description."),
  }),
  execute: async ({ raw_input }): Promise<StructuredRequirement> => {
    const lines = raw_input
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const entities = Array.from(
      new Set(raw_input.match(/[A-Za-z][A-Za-z0-9-]{2,}/g)?.slice(0, 8) ?? []),
    );

    const targetUsers = /(student|teacher|admin|buyer|seller|manager|user|家长|学生|老师)/gi.test(raw_input)
      ? Array.from(new Set(raw_input.match(/student|teacher|admin|buyer|seller|manager|user|家长|学生|老师/gi) ?? []))
      : ["end users"];

    const requirement: StructuredRequirement = {
      projectName: detectProjectName(lines[0] ?? raw_input),
      rawSummary: lines.join(" ") || raw_input,
      entities,
      targetUsers,
      coreFeatures: lines.slice(0, 5),
      constraints: raw_input.includes("must") || raw_input.includes("必须") ? ["Contains explicit must-have constraints"] : [],
      ambiguities:
        targetUsers.length === 0 || !raw_input.match(/budget|timeline|约束|限制|并发|security|integrat/i)
          ? ["Clarify business constraints, success metrics, and timeline if they matter."]
          : [],
    };

    return parseOutputSchema.parse(requirement);
  },
});

export const searchKnowledgeTool = tool({
  description: "Look up requirement patterns and best-practice references for a domain.",
  parameters: z.object({
    query: z.string(),
    domain: z.string().optional(),
  }),
  execute: async ({ query, domain }): Promise<KnowledgeSearchResult> => {
    const sourceKey = (domain ?? query).toLowerCase();
    const key = Object.keys(knowledgePatterns).find((entry) => sourceKey.includes(entry)) ?? "default";

    return {
      source: "seeded-pattern-library",
      pattern: knowledgePatterns[key],
      relevance: key === "default" ? 0.72 : 0.89,
    };
  },
});

export const generateStoriesTool = tool({
  description: "Emit structured user stories with priorities and acceptance criteria.",
  parameters: z.object({
    project_name: z.string(),
    stories: z.array(storySchema),
  }),
  execute: async ({ project_name, stories }): Promise<StoryGenerationResult> => {
    const normalizedStories: UserStory[] = stories.map((story, index) => ({
      ...story,
      id: story.id || `US-${String(index + 1).padStart(3, "0")}`,
      priority: story.priority ?? pickPriority(index, stories.length),
      acceptanceCriteria: story.acceptanceCriteria,
    }));

    return {
      projectName: project_name,
      total: normalizedStories.length,
      stories: normalizedStories,
      summary: {
        must: normalizedStories.filter((story) => story.priority === "must").length,
        should: normalizedStories.filter((story) => story.priority === "should").length,
        could: normalizedStories.filter((story) => story.priority === "could").length,
      },
    };
  },
});

export const generateDocTool = tool({
  description: "Return the final requirement specification as markdown.",
  parameters: docSchema,
  execute: async ({ projectName, content }): Promise<DocumentGenerationResult> => {
    return {
      projectName,
      format: "markdown",
      content,
      charCount: content.length,
    };
  },
});
