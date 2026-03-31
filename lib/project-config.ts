import { promises as fs } from "node:fs";
import { PROJECT_CONFIG_PATH } from "@/lib/project-paths";
import { ensureProjectState } from "@/lib/project-state";

export type ReqAgentProjectConfig = {
  defaultTemplateId: string;
  enabledSkillIds: string[];
  /** Harness configuration — parsed separately by lib/harness/harness-config.ts */
  harness?: Record<string, unknown>;
};

export const DEFAULT_PROJECT_CONFIG: ReqAgentProjectConfig = {
  defaultTemplateId: "default",
  enabledSkillIds: ["cap-mermaid"],
};

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))];
}

function normalizeProjectConfig(value: unknown): ReqAgentProjectConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PROJECT_CONFIG };
  }

  const input = value as Partial<ReqAgentProjectConfig>;
  const defaultTemplateId =
    typeof input.defaultTemplateId === "string" && input.defaultTemplateId.trim()
      ? input.defaultTemplateId.trim()
      : DEFAULT_PROJECT_CONFIG.defaultTemplateId;
  const enabledSkillIds = normalizeStringArray(input.enabledSkillIds);

  return {
    defaultTemplateId,
    enabledSkillIds:
      enabledSkillIds.length > 0
        ? enabledSkillIds
        : [...DEFAULT_PROJECT_CONFIG.enabledSkillIds],
  };
}

export async function readProjectConfig() {
  await ensureProjectState();

  try {
    const raw = await fs.readFile(PROJECT_CONFIG_PATH, "utf8");
    return normalizeProjectConfig(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_PROJECT_CONFIG };
  }
}

export async function writeProjectConfig(
  patch: Partial<ReqAgentProjectConfig>,
) {
  await ensureProjectState();

  const current = await readProjectConfig();
  const next = normalizeProjectConfig({
    ...current,
    ...patch,
  });
  await fs.writeFile(
    PROJECT_CONFIG_PATH,
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8",
  );
  return next;
}
