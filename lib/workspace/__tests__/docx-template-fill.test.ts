import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { fillDocxTemplate } from "../docx-support";

describe("fillDocxTemplate cleanup integration", () => {
  it("output has no empty table rows after fill", async () => {
    const candidatePaths = [
      ".reqagent/workspaces/ws_e2e_502d792d79cd-aac0f0cc7e41/docs/零售业务需求说明书_精细模板.docx",
      ".reqagent/workspaces/ws_77420f3f-2cde-47b7-8b0c-c03abe621356-636865ed732e/docs/零售业务需求说明书_精细模板.docx",
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
});
