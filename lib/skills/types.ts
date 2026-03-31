/** Skill manifest stored in `skills/<id>/skill.json`. */
export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  type: "knowledge" | "capability" | "hybrid";
  domain?: string;
  description: string;
  author?: string;
  tags?: string[];
  provides: {
    prompt?: boolean;
    knowledge?: boolean;
    outputTemplate?: boolean;
    tools?: boolean;
  };
}

/** A fully loaded skill with all content resolved from disk. */
export interface LoadedSkill {
  manifest: SkillManifest;
  prompt: string;
  knowledge: string;
  outputTemplate: string;
}

/** Runtime result from `buildSkillRuntime` — parallel to MCP's `buildMcpRuntime`. */
export interface SkillRuntime {
  skills: LoadedSkill[];
  promptSection: string;
}

// ---------------------------------------------------------------------------
// Frontend-facing aliases (used by UI components)
// ---------------------------------------------------------------------------

export type ReqAgentSkillType = SkillManifest["type"];

/** Lightweight manifest for API responses and UI rendering. */
export type ReqAgentSkillManifest = Pick<
  SkillManifest,
  "id" | "name" | "version" | "type" | "description" | "tags"
>;

/** Minimal skill identity for streaming metadata chips. */
export type ReqAgentLoadedSkillMeta = Pick<SkillManifest, "id" | "name" | "type">;
