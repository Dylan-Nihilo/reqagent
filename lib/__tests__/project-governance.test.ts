import { describe, expect, it } from "vitest";
import { readProjectConfig } from "@/lib/project-config";
import { resolveProjectTemplate } from "@/lib/project-templates";
import { listSkills } from "@/lib/skills/loader";

describe("project governance", () => {
  it("reads project-level config from repo root", async () => {
    const config = await readProjectConfig();

    expect(config.defaultTemplateId).toBe("default");
    expect(config.enabledSkillIds).toContain("cap-mermaid");
  });

  it("resolves the default project template from templates registry", async () => {
    const resolved = await resolveProjectTemplate();

    expect(resolved).not.toBeNull();
    expect(resolved?.item.id).toBe("default");
    expect(resolved?.item.templatePath).toBe("templates/profiles/default/template.docx");
  });

  it("loads skills from the project-level skills root", async () => {
    const skills = await listSkills();

    expect(skills.some((skill) => skill.id === "cap-mermaid")).toBe(true);
  });
});
