import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { LoadedSkill, SkillManifest, SkillRuntime } from "./types";

/** Root directory for skill definitions. */
const SKILLS_ROOT = path.join(process.cwd(), ".reqagent", "skills");

/** Maximum characters of merged knowledge content per skill. */
const KNOWLEDGE_CAP = 32_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Merge all .md files in a directory into a single string with headers.
 * Content is capped at KNOWLEDGE_CAP characters.
 */
async function loadKnowledgeDir(dir: string): Promise<string> {
  if (!(await fileExists(dir))) return "";

  const entries = await readdir(dir);
  const mdFiles = entries.filter((f) => f.endsWith(".md")).sort();
  const sections: string[] = [];
  let total = 0;

  for (const file of mdFiles) {
    const content = await readFile(path.join(dir, file), "utf-8");
    const section = "### " + file + "\n\n" + content.trim();
    if (total + section.length > KNOWLEDGE_CAP) {
      sections.push(section.slice(0, KNOWLEDGE_CAP - total));
      break;
    }
    sections.push(section);
    total += section.length;
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Scan `.reqagent/skills/{id}/skill.json` and return all valid manifests. */
export async function listSkills(): Promise<SkillManifest[]> {
  if (!(await fileExists(SKILLS_ROOT))) return [];

  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const manifests: SkillManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(SKILLS_ROOT, entry.name, "skill.json");
    if (!(await fileExists(manifestPath))) continue;

    try {
      const raw = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(raw) as SkillManifest;
      // Ensure id matches directory name
      manifest.id = entry.name;
      manifests.push(manifest);
    } catch (err) {
      console.warn("[skills] Failed to parse " + manifestPath + ":", err);
    }
  }

  return manifests;
}

/** Load a single skill by id. */
export async function loadSkill(id: string): Promise<LoadedSkill | null> {
  const skillDir = path.join(SKILLS_ROOT, id);
  const manifestPath = path.join(skillDir, "skill.json");
  if (!(await fileExists(manifestPath))) return null;

  try {
    const raw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(raw) as SkillManifest;
    manifest.id = id;

    const [prompt, knowledge, outputTemplate] = await Promise.all([
      readOptionalFile(path.join(skillDir, "prompt.md")),
      loadKnowledgeDir(path.join(skillDir, "knowledge")),
      readOptionalFile(path.join(skillDir, "output-template.md")),
    ]);

    return { manifest, prompt, knowledge, outputTemplate };
  } catch (err) {
    console.warn('[skills] Failed to load skill "' + id + '":', err);
    return null;
  }
}

/**
 * Load requested skills and build a SkillRuntime with a composed prompt section.
 * Mirrors the buildMcpRuntime pattern.
 */
export async function buildSkillRuntime(
  skillIds: string[],
): Promise<SkillRuntime> {
  if (skillIds.length === 0) {
    return { skills: [], promptSection: "" };
  }

  const results = await Promise.all(skillIds.map(loadSkill));
  const skills = results.filter((s): s is LoadedSkill => s !== null);

  if (skills.length === 0) {
    return { skills: [], promptSection: "" };
  }

  const sections = skills.map((skill) => {
    const parts: string[] = [
      "## Skill: " + skill.manifest.name + " (" + skill.manifest.type + ")",
    ];
    if (skill.prompt) parts.push(skill.prompt);
    if (skill.knowledge) {
      parts.push("### Reference Knowledge\n\n" + skill.knowledge);
    }
    if (skill.outputTemplate) {
      parts.push("### Output Template\n\n" + skill.outputTemplate);
    }
    return parts.join("\n\n");
  });

  const promptSection =
    "\n--- Loaded Skills ---\n\n" + sections.join("\n\n---\n\n");

  console.log(
    "[skills] Loaded " +
      skills.length +
      " skill(s): " +
      skills.map((s) => s.manifest.id).join(", "),
  );

  return { skills, promptSection };
}
