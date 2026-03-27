import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { buildDocxTemplatePayload, fillDocxTemplate } from "../docx-support";

function buildSevenFeatureMarkdown() {
  const featureBlock = (index: number) => `### 能力项：功能项${index}

#### 业务流程
1. 步骤${index}-1
2. 步骤${index}-2

#### 功能详述
1. 说明${index}-1

#### 业务规则
1. 规则${index}-1

#### 输入要素
| 序号 | 字段名称 | 类型 | 是否必填 | 枚举值 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | input${index} | String | 是 | - | 输入说明${index} |

#### 输出要素
| 序号 | 字段名称 | 类型 | 是否必填 | 枚举值 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | output${index} | String | 是 | - | 输出说明${index} |
`;

  return `# 七功能项冒烟测试需求说明书

## 概述

### 需求背景
用于验证通用 Base DOCX 模板在多能力项场景下的稳定展开。

### 建设目标
确保功能项可按输入顺序展开。

### 业务价值
降低模板化生成失真风险。

### 术语定义
| 术语 | 定义 |
| --- | --- |
| 能力项 | 可独立展开的功能块 |

## 业务概述

### 业务概述
本期用于通用模板的功能项克隆与版式验证。

### 业务处理总流程
\`\`\`mermaid
flowchart TD
  A[输入需求] --> B[展开功能块]
\`\`\`

### 现状问题分析
当前缺少独立的多功能项冒烟校验。

### 项目参与部门及职责
| 部门名称 | 职责 |
| --- | --- |
| 需求管理部 | 提供需求输入 |
| 平台研发部 | 负责模板生成 |
| 质量保障部 | 负责结果校验 |

## 功能描述

### 功能架构
1. 功能项1
2. 功能项2
3. 功能项3
4. 功能项4
5. 功能项5
6. 功能项6
7. 功能项7

${Array.from({ length: 7 }, (_value, index) => featureBlock(index + 1)).join("\n")}
`;
}

describe("fillDocxTemplate cleanup integration", () => {
  it("clean shell is python-docx readable and stripped of dirty content", async () => {
    const templatePath = path.join(process.cwd(), "docs/用户需求说明书_Base_clean.docx");

    await expect(fs.access(templatePath)).resolves.toBeUndefined();
    await execa("python3", [
      "-c",
      `from docx import Document; Document(r"""${templatePath}""")`,
    ]);

    const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), "docx-clean-shell-"));
    try {
      await execa("unzip", ["-q", templatePath, "-d", extractDir]);
      const xml = await fs.readFile(path.join(extractDir, "word/document.xml"), "utf8");
      const rels = await fs.readFile(path.join(extractDir, "word/_rels/document.xml.rels"), "utf8");

      expect(xml).not.toContain("注意：此项必填");
      expect(xml).not.toContain("数据流向如下流程图");
      expect(xml).not.toContain("零售水晶球");
      expect(xml).not.toContain("SR_");
      expect(xml).not.toContain("<w:object");
      expect(xml).not.toContain("<w:pict");
      expect(rels).not.toContain("image4.png");
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true });
    }
  });

  it("output has no empty table rows after fill", async () => {
    const candidatePaths = [
      "docs/用户需求说明书_Base_clean.docx",
    ];

    let templatePath: string | undefined;
    for (const candidate of candidatePaths) {
      const full = path.join(process.cwd(), candidate);
      try {
        await fs.access(full);
        templatePath = full;
        break;
      } catch { /* try next */ }
    }

    if (!templatePath) {
      console.log("Template not found, skipping integration test");
      return;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docx-fill-test-"));
    const outputPath = path.join(tmpDir, "output.docx");

    try {
      await fillDocxTemplate({
        templatePath,
        outputPath,
        placeholderValues: {
          "项目名称": "测试项目",
          "需求背景": "测试背景内容",
          "输入字段1": "userId",
          "输入类型1": "String",
          "输入必填1": "是",
        },
      });

      const extractDir = path.join(tmpDir, "extracted");
      await execa("unzip", ["-q", outputPath, "-d", extractDir]);
      const xml = await fs.readFile(path.join(extractDir, "word/document.xml"), "utf8");

      // Count empty rows: rows where stripping all tags leaves no text
      const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
      const emptyRows = rows.filter((row) => {
        const text = row[0].replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
        return text.length === 0;
      });

      expect(emptyRows.length).toBe(0);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("repairs broken relationships and expands all feature blocks for requirements.md", async () => {
    const workspaceRoot = process.cwd();
    const templatePath = path.join(
      workspaceRoot,
      "docs/用户需求说明书_Base_clean.docx",
    );
    const requirementsPath = path.join(
      workspaceRoot,
      ".reqagent/workspaces/ws_77420f3f-2cde-47b7-8b0c-c03abe621356-636865ed732e/docs/requirements.md",
    );

    try {
      await Promise.all([fs.access(templatePath), fs.access(requirementsPath)]);
    } catch {
      console.log("Template or requirements not found, skipping integration test");
      return;
    }

    const markdown = await fs.readFile(requirementsPath, "utf8");
    const buildResult = buildDocxTemplatePayload(markdown, "员工考勤管理系统需求说明书", {
      author: "ReqAgent",
      version: "v0.2",
      docDate: "2025/08/26",
    });

    expect(buildResult.featureBlocks).toHaveLength(14);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docx-fill-quality-"));
    const outputPath = path.join(tmpDir, "quality-output.docx");

    try {
      const result = await fillDocxTemplate({
        templatePath,
        outputPath,
        placeholderValues: buildResult.placeholderValues,
        featureBlocks: buildResult.featureBlocks,
        departmentRecords: buildResult.departmentRecords,
        buildResult,
      });

      expect(result.qualityReport?.featureBlockCount).toBe(14);
      expect(result.qualityReport?.placeholderResidualCount).toBe(0);
      expect(result.qualityReport?.relationIntegrity.isClean).toBe(true);
      expect(result.qualityReport?.structureCoverageRatio).toBeGreaterThan(0.9);

      const extractDir = path.join(tmpDir, "extracted");
      await execa("unzip", ["-q", outputPath, "-d", extractDir]);

      const xml = await fs.readFile(path.join(extractDir, "word/document.xml"), "utf8");
      const rels = await fs.readFile(path.join(extractDir, "word/_rels/document.xml.rels"), "utf8");

      expect(xml).not.toContain("{{");
      expect(xml).not.toContain("注意：此项必填");
      expect(xml).not.toContain("数据流向如下流程图");
      expect(xml).not.toContain("零售水晶球");
      expect(xml).not.toContain("非标准化代发");
      expect(rels).not.toContain("image4.png");
      expect(xml).toContain("人力资源部");
      expect(xml).toContain("信息技术部");
      expect(xml).toContain("法务/内控（如有）");

      const featureHeadingMatches = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
        .map((match) => match[0])
        .filter(
          (paragraphXml) =>
            /业务功能(?:[一二三四五六七八九十]|\d+)：/.test(paragraphXml) &&
            !paragraphXml.includes("PAGEREF"),
        );
      expect(featureHeadingMatches.length).toBe(14);

      await execa("python3", [
        "-c",
        `from docx import Document; Document(r"""${outputPath}""")`,
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("expands seven synthetic feature blocks in source order", async () => {
    const workspaceRoot = process.cwd();
    const templatePath = path.join(
      workspaceRoot,
      "docs/用户需求说明书_Base_clean.docx",
    );

    try {
      await fs.access(templatePath);
    } catch {
      console.log("Template not found, skipping integration test");
      return;
    }

    const buildResult = buildDocxTemplatePayload(
      buildSevenFeatureMarkdown(),
      "七功能项冒烟测试需求说明书",
      {
        author: "ReqAgent",
        version: "v0.1",
        docDate: "2026/03/26",
      },
    );

    expect(buildResult.featureBlocks).toHaveLength(7);
    expect(buildResult.featureBlocks.map((feature) => feature.name)).toEqual([
      "功能项1",
      "功能项2",
      "功能项3",
      "功能项4",
      "功能项5",
      "功能项6",
      "功能项7",
    ]);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docx-fill-seven-"));
    const outputPath = path.join(tmpDir, "seven-features.docx");

    try {
      const result = await fillDocxTemplate({
        templatePath,
        outputPath,
        placeholderValues: buildResult.placeholderValues,
        featureBlocks: buildResult.featureBlocks,
        departmentRecords: buildResult.departmentRecords,
        buildResult,
      });

      expect(result.qualityReport?.featureBlockCount).toBe(7);
      expect(result.qualityReport?.relationIntegrity.isClean).toBe(true);

      const extractDir = path.join(tmpDir, "extracted");
      await execa("unzip", ["-q", outputPath, "-d", extractDir]);
      const xml = await fs.readFile(path.join(extractDir, "word/document.xml"), "utf8");

      const featureTexts = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
        .map((match) => match[0])
        .filter(
          (paragraphXml) =>
            /业务功能(?:[一二三四五六七八九十]|\d+)：/.test(paragraphXml) &&
            !paragraphXml.includes("PAGEREF"),
        )
        .map((paragraphXml) => paragraphXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

      expect(featureTexts).toHaveLength(7);
      expect(featureTexts[0]).toContain("业务功能一：功能项1");
      expect(featureTexts[6]).toContain("功能项7");
      expect(xml).toContain("需求管理部");
      expect(xml).toContain("平台研发部");
      expect(xml).toContain("质量保障部");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
