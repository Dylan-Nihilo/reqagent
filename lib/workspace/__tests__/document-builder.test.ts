import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execa } from "execa";
import { DocumentBuilder } from "../document-builder";
import { buildDocxTemplatePayload, fillDocxTemplate } from "../docx-support";
import { DEFAULT_DOCX_TEMPLATE_PATH } from "../docx-template-path";

function makeVisibleText(length: number, prefix = "x") {
  if (length <= prefix.length) {
    return prefix.slice(0, length);
  }

  return `${prefix}${"x".repeat(length - prefix.length)}`;
}

function createFeatureBlock(index: number, name: string) {
  return {
    index,
    name,
    process_items: [`${name}流程步骤一`, `${name}流程步骤二`],
    detail_items: [`${name}功能说明一`, `${name}功能说明二`],
    rule_items: [`${name}规则一`, `${name}规则二`],
    input_table: [
      {
        field: `${name}输入字段`,
        type: "String",
        required: "是",
        enum_values: "-",
        note: `${name}输入说明`,
      },
    ],
    output_table: [
      {
        field: `${name}输出字段`,
        type: "String",
        required: "是",
        enum_values: "-",
        note: `${name}输出说明`,
      },
    ],
  };
}

async function finalizeBuilder(builder: DocumentBuilder, outputPath: string) {
  const metadata = builder.getMetadata();
  const buildResult = buildDocxTemplatePayload(
    builder.toMarkdown(),
    metadata.title,
    {
      author: metadata.author,
      organization: metadata.organization,
      version: metadata.version,
    },
    builder.getTemplateProfile().id,
  );

  const result = await fillDocxTemplate({
    templatePath: DEFAULT_DOCX_TEMPLATE_PATH,
    outputPath,
    placeholderValues: buildResult.placeholderValues,
    featureBlocks: buildResult.featureBlocks,
    departmentRecords: buildResult.departmentRecords,
    buildResult,
  });

  return {
    buildResult,
    result,
  };
}

describe("DocumentBuilder", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "reqagent-document-builder-"));
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  describe("Group 1: unit tests", () => {
    it("init creates builder with correct outline from profile", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      const profile = builder.getTemplateProfile();
      const outline = builder.getOutline();

      expect(builder.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(outline).toHaveLength(profile.sectionContracts.length);
      expect(outline.map((section) => section.section_id)).toEqual(
        profile.sectionContracts.map((section) => section.id),
      );
      expect(outline[0]).toMatchObject({
        section_id: profile.sectionContracts[0]?.id,
        title: profile.sectionContracts[0]?.title,
        required: profile.sectionContracts[0]?.required,
        target_chars: profile.sectionContracts[0]?.targetChars,
        status: "pending",
      });
    });

    it("fillSection stores content and returns correct metrics", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      const result = builder.fillSection("1.1", {
        markdown: makeVisibleText(126, "背景"),
      });

      expect(result).toEqual({
        section_id: "1.1",
        status: "filled",
        actual_chars: 126,
        target_chars: 180,
        ratio: 0.7,
        within_range: true,
      });
      expect(builder.getStatus().filled).toEqual([
        {
          section_id: "1.1",
          title: "需求背景",
          chars: 126,
          ratio: 0.7,
        },
      ]);
    });

    it("fillSection overwrites on repeated call", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      builder.fillSection("1.1", {
        markdown: "FIRST-DRAFT-CONTENT",
      });
      const result = builder.fillSection("1.1", {
        markdown: makeVisibleText(180, "SECOND-DRAFT"),
      });

      expect(result.actual_chars).toBe(180);
      expect(result.ratio).toBe(1);
      expect(builder.getStatus().filled).toEqual([
        {
          section_id: "1.1",
          title: "需求背景",
          chars: 180,
          ratio: 1,
        },
      ]);

      const markdown = builder.toMarkdown();
      expect(markdown).toContain("SECOND-DRAFT");
      expect(markdown).not.toContain("FIRST-DRAFT-CONTENT");
    });

    it("fillSection rejects unknown sectionId", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      expect(() =>
        builder.fillSection("9.9.9", {
          markdown: "invalid",
        }),
      ).toThrow("Unknown section id: 9.9.9");
    });

    it("getStatus shows filled and pending split correctly", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      builder.fillSection("1.1", {
        markdown: makeVisibleText(126, "背景"),
      });
      builder.fillSection("1.2", {
        markdown: makeVisibleText(84, "目标"),
      });

      const status = builder.getStatus();
      const requiredCount = builder.getTemplateProfile().sectionContracts.filter((section) => section.required).length;

      expect(status.status).toBe("drafting");
      expect(status.filled.map((section) => section.section_id)).toEqual(["1.1", "1.2"]);
      expect(status.pending.some((section) => section.section_id === "1.3")).toBe(true);
      expect(status.completion_ratio).toBe(Number((2 / requiredCount).toFixed(2)));
    });

    it("isComplete returns false when required sections are missing", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      builder.fillSection("1.1", {
        markdown: makeVisibleText(180, "背景"),
      });

      expect(builder.isComplete()).toBe(false);
    });

    it("isComplete returns true when all required sections are filled", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      for (const section of builder.getTemplateProfile().sectionContracts.filter((entry) => entry.required)) {
        builder.fillSection(section.id, {
          markdown: makeVisibleText(Math.max(section.targetChars, 1), section.id),
        });
      }

      expect(builder.isComplete()).toBe(true);
      expect(builder.getStatus().status).toBe("complete");
    });

    it("addFeatureBlock stores block and increments count", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      builder.addFeatureBlock(createFeatureBlock(1, "账户开户"));
      builder.addFeatureBlock(createFeatureBlock(2, "账户复核"));

      const status = builder.getStatus();
      const markdown = builder.toMarkdown();

      expect(status.feature_blocks).toEqual({
        filled: 2,
        total: 2,
      });
      expect(markdown).toContain("业务功能一：账户开户");
      expect(markdown).toContain("业务功能二：账户复核");
    });

    it("toMarkdown assembles sections in profile order", () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      builder.fillSection("1.2", {
        markdown: "目标内容-B",
      });
      builder.fillSection("1.1", {
        markdown: "背景内容-A",
      });

      const markdown = builder.toMarkdown();

      expect(markdown.indexOf("## 1.1 需求背景")).toBeLessThan(markdown.indexOf("## 1.2 业务目标"));
      expect(markdown.indexOf("背景内容-A")).toBeLessThan(markdown.indexOf("目标内容-B"));
    });
  });

  describe("Group 2: persistence tests", () => {
    it("save writes JSON to .docbuilder directory", async () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
      });

      builder.fillSection("1.1", {
        markdown: "落盘测试内容",
      });
      await builder.save();

      const statePath = path.join(workspaceDir, ".docbuilder", `${builder.id}.json`);
      const raw = await fs.readFile(statePath, "utf8");
      const parsed = JSON.parse(raw) as {
        id: string;
        template_profile_id: string;
        sections: Array<[string, { markdown: string }]>;
      };

      expect(parsed.id).toBe(builder.id);
      expect(parsed.template_profile_id).toBe("user-requirements-base-v1");
      expect(parsed.sections).toContainEqual([
        "1.1",
        {
          markdown: "落盘测试内容",
        },
      ]);
    });

    it("load restores exact state from disk", async () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "开户管理需求说明书",
        author: "ReqAgent",
        version: "V1.0",
        organization: "平台研发部",
      });

      builder.fillSection("1.1", {
        markdown: "恢复测试背景",
      });
      builder.fillSection("1.4", {
        markdown: "",
        term_records: [
          {
            term: "开户单",
            definition: "用于发起开户流程的业务单据",
          },
        ],
      });
      builder.addFeatureBlock(createFeatureBlock(1, "账户开户"));

      await builder.save();

      const loaded = await DocumentBuilder.load(workspaceDir, builder.id);

      expect(loaded.getMetadata()).toEqual(builder.getMetadata());
      expect(loaded.getStatus()).toEqual(builder.getStatus());
      expect(loaded.toMarkdown()).toEqual(builder.toMarkdown());
    });

    it("load throws for non-existent id", async () => {
      await expect(DocumentBuilder.load(workspaceDir, randomUUID())).rejects.toThrow();
    });
  });

  describe("Group 3: integration test", () => {
    const integrationIt = existsSync(DEFAULT_DOCX_TEMPLATE_PATH) ? it : it.skip;

    integrationIt("Full flow: init -> fill 5 required sections + 2 feature blocks -> finalize -> verify DOCX has no placeholder residuals", async () => {
      const builder = new DocumentBuilder(workspaceDir, {
        title: "账户管理平台需求说明书",
        author: "ReqAgent",
        version: "V1.0",
        organization: "平台研发部",
      });

      await builder.save();

      const resumedBuilder = await DocumentBuilder.load(workspaceDir, builder.id);
      resumedBuilder.fillSection("1.1", {
        markdown: "本期建设用于统一账户管理平台的开户、复核与状态查询链路。",
      });
      resumedBuilder.fillSection("1.2", {
        markdown: "提升开户效率，降低人工复核成本，并统一业务口径。",
      });
      resumedBuilder.fillSection("1.3", {
        markdown: "通过标准化流程与统一规则，提升业务处理质量与追溯能力。",
      });
      resumedBuilder.fillSection("1.4", {
        markdown: "",
        term_records: [
          {
            term: "开户单",
            definition: "用于驱动开户流程处理的标准业务单据。",
          },
          {
            term: "复核任务",
            definition: "对开户结果进行人工或系统校验的待办任务。",
          },
        ],
      });
      resumedBuilder.fillSection("2.1", {
        markdown: "覆盖开户申请、资料校验、状态跟踪、异常处理与结果通知等关键场景。",
      });
      resumedBuilder.addFeatureBlock(createFeatureBlock(1, "账户开户"));
      resumedBuilder.addFeatureBlock(createFeatureBlock(2, "账户复核"));

      await resumedBuilder.save();

      const outputPath = path.join(workspaceDir, "docs", "document-builder-integration.docx");
      const { buildResult, result } = await finalizeBuilder(resumedBuilder, outputPath);

      expect(buildResult.featureBlocks).toHaveLength(2);
      expect(result.qualityReport?.placeholderResidualCount).toBe(0);
      expect(result.relationIntegrity.isClean).toBe(true);

      const extractDir = path.join(workspaceDir, "docs", "document-builder-extracted");
      await execa("unzip", ["-q", outputPath, "-d", extractDir]);
      const xml = await fs.readFile(path.join(extractDir, "word", "document.xml"), "utf8");

      expect(xml).not.toContain("{{");
      expect(xml).toContain("账户开户");
      expect(xml).toContain("账户复核");
      expect(xml).not.toContain("注意：此项必填");
    });
  });
});
