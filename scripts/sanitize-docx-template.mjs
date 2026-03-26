// scripts/sanitize-docx-template.mjs
//
// Usage: node scripts/sanitize-docx-template.mjs <input.docx> [output.docx]
//
// Cleans a DOCX template by:
// 1. Replacing hardcoded old bank feature name with placeholder
// 2. Removing instruction paragraphs (editorial guidance text)
// 3. Removing stale embedded images from old source document
// 4. Fixing old bank-specific headings in TOC

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) {
  console.error("Usage: node sanitize-docx-template.mjs <input.docx> [output.docx]");
  process.exit(1);
}
const finalOutput = outputPath || inputPath.replace(/\.docx$/, "_sanitized.docx");

const tempDir = mkdtempSync(join(tmpdir(), "sanitize-docx-"));

try {
  // Unzip template
  execFileSync("unzip", ["-q", inputPath, "-d", tempDir]);

  let xml = readFileSync(join(tempDir, "word/document.xml"), "utf8");
  const before = xml.length;

  // --- 1. Fix old bank heading in TOC and body ---
  // Match with or without trailing 功能 suffix
  xml = xml.replace(
    /新增代发管理[-—]非标准化代发业务单位管理(?:功能)?/g,
    "{{功能名称1}}"
  );

  // --- 2. Remove instruction paragraphs ---
  const instructionPatterns = [
    "对每个功能模块进行描述",
    "逐项叙述需要实现的功能要求",
    "描述功能模块的各种限制条件",
    "所有功能模块需要与需求条目细化",
    "列出该项目可能涉及的部门和人员",
    "按业务操作顺序描述",
    "A – 添加的  M – 修改的  D – 删除的",
  ];

  for (const phrase of instructionPatterns) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `<w:p\\b[^>]*>(?:(?!<w:p\\b).)*?${escaped}[\\s\\S]*?</w:p>`,
      "g"
    );
    xml = xml.replace(regex, "");
  }

  // --- 3. Remove stale flowchart image drawing ---
  xml = xml.replace(
    /<w:drawing>[\s\S]*?<\/w:drawing>/g,
    (match) => {
      if (/image4\.png|rId10/.test(match)) return "";
      return match;
    }
  );

  const after = xml.length;
  console.log(`XML size: ${before} -> ${after} (removed ${before - after} chars)`);

  writeFileSync(join(tempDir, "word/document.xml"), xml, "utf8");

  // Remove the old image file itself
  const imagePath = join(tempDir, "word/media/image4.png");
  if (existsSync(imagePath)) {
    unlinkSync(imagePath);
    console.log("Removed: word/media/image4.png");
  }

  // Re-zip
  if (existsSync(finalOutput)) unlinkSync(finalOutput);
  execFileSync("zip", ["-qr", finalOutput, "."], { cwd: tempDir });
  console.log(`Sanitized template written to: ${finalOutput}`);

  // Verify
  const verifyDir = mkdtempSync(join(tmpdir(), "verify-docx-"));
  execFileSync("unzip", ["-q", finalOutput, "-d", verifyDir]);
  const verifyXml = readFileSync(join(verifyDir, "word/document.xml"), "utf8");
  const remaining = verifyXml.match(/代发管理|非标准化代发|对每个功能模块进行描述/g);
  if (remaining) {
    console.warn(`WARNING: ${remaining.length} old content fragments still found`);
  } else {
    console.log("Verification PASSED: no old bank content or instructions found");
  }
  rmSync(verifyDir, { recursive: true, force: true });

} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
