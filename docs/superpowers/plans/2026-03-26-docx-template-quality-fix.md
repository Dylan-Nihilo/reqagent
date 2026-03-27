# DOCX Template Quality Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 of 6 quality issues in the DOCX export pipeline — empty table rows, empty paragraphs, leaked old bank content, template instructions, and stale flowchart/TOC. (Issue #6, multi-feature dynamic injection, is deferred to Phase 2.)

**Architecture:** Two-layer fix. Layer A modifies `fillDocxTemplate()` in `docx-support.ts` to clean up empty XML elements after placeholder substitution. Layer B creates a one-time template sanitization script that removes old bank content, instruction text, and the stale flowchart from the template DOCX itself. Both layers are independent and can be tested separately.

**Tech Stack:** TypeScript (Node.js), OOXML regex manipulation, `execa` for zip/unzip, `vitest` for tests.

---

## Diagnostic Summary

Output DOCX stats from the latest generation run:

| Metric | Value | Root Cause |
|--------|-------|------------|
| Empty table rows | 44 / 60 | Unfilled `{{placeholder}}` cleared to empty text, `<w:tr>` row kept |
| Empty paragraphs | 358 / 594 | Same — `<w:p>` with no `<w:t>` text left behind |
| Old bank content in TOC | 1 occurrence | TOC entries are static text, not placeholders |
| Template instructions | 6 paragraphs | "对每个功能模块进行描述..." etc. baked into template body |
| Stale flowchart image | 1 (image4.png) | Old bank's "数据流向如下流程图" image never replaced |
| Lost feature sections | 5 of 7 | Template has slots for 2 features; `primaryFeature` only fills 1st |

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `lib/workspace/docx-support.ts` | Modify | Add post-substitution XML cleanup (empty rows, empty paragraphs) |
| `lib/workspace/__tests__/docx-cleanup.test.ts` | Create | Unit tests for XML cleanup functions |
| `scripts/sanitize-docx-template.mjs` | Create | One-time script to clean template DOCX |
| `lib/workspace/__tests__/docx-template-fill.test.ts` | Create | Integration test: fill template + verify no empty rows |

---

## Phase A: fillDocxTemplate Cleanup Logic

### Task 1: Add `removeEmptyTableRows` helper

Removes `<w:tr>` elements where every `<w:tc>` cell contains no visible text.

**Files:**
- Modify: `lib/workspace/docx-support.ts` (add helper before `fillDocxTemplate`, ~line 1389)
- Create: `lib/workspace/__tests__/docx-cleanup.test.ts`

- [ ] **Step 1: Write failing test for empty row removal**

```ts
// lib/workspace/__tests__/docx-cleanup.test.ts
import { describe, it, expect } from "vitest";
import { removeEmptyTableRows } from "../docx-support";

describe("removeEmptyTableRows", () => {
  it("removes rows where all cells are empty", () => {
    const xml = [
      '<w:tbl>',
      '<w:tr><w:tc><w:p><w:r><w:t>Header</w:t></w:r></w:p></w:tc></w:tr>',
      '<w:tr><w:tc><w:p><w:r><w:t>Data</w:t></w:r></w:p></w:tc></w:tr>',
      '<w:tr><w:tc><w:p><w:pPr/></w:p></w:tc><w:tc><w:p/></w:tc></w:tr>',
      '</w:tbl>',
    ].join("");
    const result = removeEmptyTableRows(xml);
    expect(result).toContain("Header");
    expect(result).toContain("Data");
    // The empty row should be gone — only 2 <w:tr> remain
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2);
  });

  it("preserves rows with at least one non-empty cell", () => {
    const xml = [
      '<w:tbl>',
      '<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p/></w:tc></w:tr>',
      '</w:tbl>',
    ].join("");
    const result = removeEmptyTableRows(xml);
    expect((result.match(/<w:tr/g) ?? []).length).toBe(1);
  });

  it("preserves header rows in tables with mixed content", () => {
    // First row = header, second = data, third-fifth = empty
    const header = '<w:tr><w:tc><w:p><w:r><w:t>序号</w:t></w:r></w:p></w:tc></w:tr>';
    const data = '<w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr>';
    const empty = '<w:tr><w:tc><w:p/></w:tc></w:tr>';
    const xml = `<w:tbl>${header}${data}${empty}${empty}${empty}</w:tbl>`;
    const result = removeEmptyTableRows(xml);
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2);
  });

  it("preserves rows containing nested tables (never remove)", () => {
    // A row whose cell contains a nested <w:tbl> — even if outer text is empty
    const row = [
      '<w:tr><w:tc>',
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nested</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      '</w:tc></w:tr>',
    ].join("");
    const xml = `<w:tbl>${row}</w:tbl>`;
    const result = removeEmptyTableRows(xml);
    expect(result).toContain("Nested");
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2); // outer + inner
  });

  it("handles multiple tables independently", () => {
    const table1 = '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>';
    const table2 = '<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const result = removeEmptyTableRows(table1 + table2);
    expect(result).toContain("A");
    expect(result).toContain("B");
    // One empty row removed from each table
    expect((result.match(/<w:tr/g) ?? []).length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/workspace/__tests__/docx-cleanup.test.ts`
Expected: FAIL — `removeEmptyTableRows` is not exported from `docx-support`

- [ ] **Step 3: Implement `removeEmptyTableRows`**

Add to `lib/workspace/docx-support.ts` before `fillDocxTemplate` (~line 1389):

```ts
/**
 * Remove <w:tr> rows where every <w:tc> cell contains no visible text.
 * This cleans up rows left empty after placeholder substitution.
 *
 * OOXML note: <w:tr> cannot nest inside <w:tr>, but <w:tc> CAN contain
 * nested tables (<w:tbl><w:tr><w:tc>...</w:tc></w:tr></w:tbl>).
 * We guard against this by preserving any row that contains a nested <w:tbl>.
 */
export function removeEmptyTableRows(xml: string) {
  return xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    // Guard: if the row contains a nested table, never remove it —
    // non-greedy regex cannot reliably parse nested <w:tc> boundaries.
    if (/<w:tbl\b/.test(row)) return row;

    // Extract text from the entire row (all cells flattened).
    // If there is ANY visible text in any cell, keep the row.
    const text = row.replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
    return text.length === 0 ? "" : row;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/workspace/__tests__/docx-cleanup.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/workspace/docx-support.ts lib/workspace/__tests__/docx-cleanup.test.ts
git commit -m "feat(docx): add removeEmptyTableRows helper to strip empty rows after placeholder fill"
```

---

### Task 2: Add `removeEmptyParagraphs` helper

Removes `<w:p>` elements that contain no `<w:t>` text, **except** paragraphs that serve structural purposes (page breaks, section breaks, TOC field codes).

**Files:**
- Modify: `lib/workspace/docx-support.ts`
- Modify: `lib/workspace/__tests__/docx-cleanup.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// Append to docx-cleanup.test.ts
import { removeEmptyParagraphs } from "../docx-support";

describe("removeEmptyParagraphs", () => {
  it("removes paragraphs with no text", () => {
    const xml = [
      '<w:p><w:pPr><w:pStyle w:val="a"/></w:pPr></w:p>',
      '<w:p><w:r><w:t>Keep me</w:t></w:r></w:p>',
      '<w:p><w:pPr/></w:p>',
    ].join("");
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("Keep me");
    expect((result.match(/<w:p[\s>]/g) ?? []).length).toBe(1);
  });

  it("preserves paragraphs with page breaks", () => {
    const xml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:br");
  });

  it("preserves paragraphs with section breaks", () => {
    const xml = '<w:p><w:pPr><w:sectPr/></w:pPr></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:sectPr");
  });

  it("preserves paragraphs with field codes (TOC, PAGEREF)", () => {
    const xml = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:fldChar");
  });

  it("preserves paragraphs inside table cells", () => {
    // Table cells must have at least one <w:p> — never strip
    const xml = '<w:tbl><w:tr><w:tc><w:p><w:pPr/></w:p></w:tc></w:tr></w:tbl>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("<w:p");
  });

  it("preserves paragraphs with VML images (<w:pict>)", () => {
    const xml = '<w:p><w:r><w:pict><v:shape>img</v:shape></w:pict></w:r></w:p>';
    const result = removeEmptyParagraphs(xml);
    expect(result).toContain("w:pict");
  });

  it("preserves paragraphs inside nested tables", () => {
    // Outer table > cell > nested table > cell > empty paragraph — must keep
    const xml = [
      '<w:tbl><w:tr><w:tc>',
      '<w:tbl><w:tr><w:tc><w:p><w:pPr/></w:p></w:tc></w:tr></w:tbl>',
      '</w:tc></w:tr></w:tbl>',
    ].join("");
    const result = removeEmptyParagraphs(xml);
    // The empty <w:p> inside the nested table cell must survive
    expect((result.match(/<w:p/g) ?? []).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/workspace/__tests__/docx-cleanup.test.ts`
Expected: FAIL — `removeEmptyParagraphs` not exported

- [ ] **Step 3: Implement `removeEmptyParagraphs`**

Add to `lib/workspace/docx-support.ts` after `removeEmptyTableRows`:

```ts
/**
 * Remove empty <w:p> paragraphs that contain no visible text.
 * Preserves structural paragraphs: page/section breaks, field codes,
 * images (both DrawingML and VML), and paragraphs inside table cells
 * (OOXML requires at least one <w:p> per <w:tc>).
 *
 * Strategy: instead of splitting on <w:tc> (fragile with nested tables),
 * we first collect all byte ranges occupied by <w:tbl> blocks, then only
 * remove <w:p> elements whose start position falls OUTSIDE any table.
 * This avoids the split-parity bug and nested-table corruption.
 */
export function removeEmptyParagraphs(xml: string) {
  // 1. Collect all top-level <w:tbl>...</w:tbl> ranges using a depth stack
  const tableRanges: Array<[number, number]> = [];
  const tagRegex = /<(\/?)w:tbl\b[^>]*>/g;
  let depth = 0;
  let rangeStart = 0;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(xml)) !== null) {
    if (!tagMatch[1]) {
      if (depth === 0) rangeStart = tagMatch.index;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        tableRanges.push([rangeStart, tagMatch.index + tagMatch[0].length]);
      }
    }
  }

  function isInsideTable(position: number) {
    return tableRanges.some(([start, end]) => position >= start && position < end);
  }

  // 2. Replace empty <w:p> outside tables
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para, offset) => {
    // Never touch paragraphs inside tables (cell structure depends on them)
    if (isInsideTable(offset)) return para;
    // Keep if it has visible text
    if (/<w:t[\s>]/.test(para)) return para;
    // Keep if it has a page or section break
    if (/w:br\s+w:type="page"/.test(para)) return para;
    if (/<w:sectPr/.test(para)) return para;
    // Keep if it has field codes (TOC, PAGEREF, etc.)
    if (/<w:fldChar/.test(para)) return para;
    if (/<w:instrText/.test(para)) return para;
    // Keep if it has DrawingML or VML image content
    if (/<w:drawing/.test(para)) return para;
    if (/<w:pict/.test(para)) return para;
    // Otherwise remove
    return "";
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/workspace/__tests__/docx-cleanup.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/workspace/docx-support.ts lib/workspace/__tests__/docx-cleanup.test.ts
git commit -m "feat(docx): add removeEmptyParagraphs helper to strip blank paragraphs after placeholder fill"
```

---

### Task 3: Wire cleanup into `fillDocxTemplate`

Call both cleanup functions after placeholder substitution and before writing XML back.

**Files:**
- Modify: `lib/workspace/docx-support.ts:1390-1416` (inside `fillDocxTemplate`)

- [ ] **Step 1: Write integration test**

```ts
// lib/workspace/__tests__/docx-template-fill.test.ts
import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { fillDocxTemplate } from "../docx-support";

describe("fillDocxTemplate cleanup integration", () => {
  it("output has no empty table rows after fill", async () => {
    // Use the actual template if available, skip otherwise
    const templatePath = path.join(
      process.cwd(),
      ".reqagent/workspaces/ws_e2e_502d792d79cd-aac0f0cc7e41/docs/零售业务需求说明书_精细模板.docx",
    );
    try {
      await fs.access(templatePath);
    } catch {
      console.log("Template not found, skipping integration test");
      return;
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "docx-fill-test-"));
    const outputPath = path.join(tmpDir, "output.docx");

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

    // Extract and check
    const extractDir = path.join(tmpDir, "extracted");
    await execa("unzip", ["-q", outputPath, "-d", extractDir]);
    const xml = await fs.readFile(path.join(extractDir, "word/document.xml"), "utf8");

    // Count empty rows
    const rows = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
    const emptyRows = rows.filter((row) => {
      const cells = [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)];
      return cells.length > 0 && cells.every((c) => !c[0].replace(/<[^>]+>/g, "").trim());
    });

    expect(emptyRows.length).toBe(0);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run integration test to verify it fails**

Run: `pnpm vitest run lib/workspace/__tests__/docx-template-fill.test.ts`
Expected: FAIL — empty rows still present (cleanup not wired yet)

- [ ] **Step 3: Wire cleanup into `fillDocxTemplate`**

Modify `lib/workspace/docx-support.ts` inside `fillDocxTemplate`, after the placeholder regex cleanup (line ~1408) and before writing:

```ts
// --- existing code (line ~1402-1408) ---
for (const [key, rawValue] of Object.entries(params.placeholderValues)) {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) continue;
  documentXml = documentXml.split(`{{${key}}}`).join(escapeXmlText(normalizedValue));
}

documentXml = documentXml.replace(/\{\{[^{}]+\}\}/g, "");

// --- ADD THESE LINES ---
// Clean up empty XML elements left behind by unfilled placeholders
documentXml = removeEmptyTableRows(documentXml);
documentXml = removeEmptyParagraphs(documentXml);
// --- END ---

await fs.writeFile(documentXmlPath, documentXml, "utf8");
```

- [ ] **Step 4: Run integration test to verify it passes**

Run: `pnpm vitest run lib/workspace/__tests__/docx-template-fill.test.ts`
Expected: PASS

- [ ] **Step 5: Run full typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/workspace/docx-support.ts lib/workspace/__tests__/docx-template-fill.test.ts
git commit -m "feat(docx): wire empty row/paragraph cleanup into fillDocxTemplate"
```

---

## Phase B: Template DOCX Sanitization

### Task 4: Create template sanitization script

One-time script that cleans the template DOCX:
1. Removes static TOC text entries (Word regenerates TOC on open via `Ctrl+A → F9`)
2. Removes instruction paragraphs ("对每个功能模块进行描述..." etc.)
3. Removes old bank flowchart image (image4.png) and its reference
4. Replaces old bank heading in TOC with `{{功能名称1}}`

**Files:**
- Create: `scripts/sanitize-docx-template.mjs`

- [ ] **Step 1: Write the sanitization script**

```js
// scripts/sanitize-docx-template.mjs
//
// Usage: node scripts/sanitize-docx-template.mjs <input.docx> [output.docx]
//
// Cleans a DOCX template by:
// 1. Clearing hardcoded TOC entry text (keeps field structure for Word regeneration)
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
  // Replace hardcoded old bank feature name in TOC entries
  xml = xml.replace(
    /新增代发管理[-—]非标准化代发业务单位管理功能?/g,
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
    // Find and remove entire <w:p> containing this phrase
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `<w:p\\b[^>]*>(?:(?!<w:p\\b).)*?${escaped}[\\s\\S]*?</w:p>`,
      "g"
    );
    xml = xml.replace(regex, "");
  }

  // --- 3. Remove stale flowchart image drawing ---
  // Remove <w:drawing> blocks that reference the old image
  xml = xml.replace(
    /<w:drawing>[\s\S]*?<\/w:drawing>/g,
    (match) => {
      // Only remove if it references the old bank image
      if (/image4\.png|rId10/.test(match)) return "";
      return match;
    }
  );

  // Also clean up the paragraph that said "数据流向如下流程图" if it's now empty
  // (handled by removeEmptyParagraphs at runtime, but clean template is better)

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
```

- [ ] **Step 2: Run sanitization on a copy of the template**

Run:
```bash
cp .reqagent/workspaces/ws_e2e_502d792d79cd-aac0f0cc7e41/docs/零售业务需求说明书_精细模板.docx /tmp/template_backup.docx
node scripts/sanitize-docx-template.mjs /tmp/template_backup.docx /tmp/template_sanitized.docx
```

Expected output:
```
XML size: NNNN -> NNNN (removed NNN chars)
Removed: word/media/image4.png
Sanitized template written to: /tmp/template_sanitized.docx
Verification PASSED: no old bank content or instructions found
```

- [ ] **Step 3: Verify sanitized template manually**

Run:
```bash
python3 -c "
import re
with open('/tmp/verify-template/word/document.xml','r') as f:
    xml = f.read()
text = re.sub(r'<[^>]+>', ' ', xml)
for term in ['代发管理','非标准化代发','对每个功能模块进行描述']:
    c = text.count(term)
    print(f'{term}: {c}')
placeholders = len(re.findall(r'\{\{[^{}]+\}\}', xml))
print(f'Placeholders remaining: {placeholders}')
"
```

Expected: All old content counts = 0, placeholders > 240

- [ ] **Step 4: Deploy sanitized template to all workspace templates**

Run:
```bash
# Copy to each workspace that has the template
for dir in .reqagent/workspaces/*/docs; do
  if [ -f "$dir/零售业务需求说明书_精细模板.docx" ]; then
    cp /tmp/template_sanitized.docx "$dir/零售业务需求说明书_精细模板.docx"
    echo "Updated: $dir"
  fi
done
```

- [ ] **Step 5: Commit**

```bash
git add scripts/sanitize-docx-template.mjs
git commit -m "chore: add template sanitization script to remove old bank content and instructions"
```

---

## Phase C: End-to-End Verification

### Task 5: Full pipeline smoke test

Run the complete DOCX generation workflow and verify all 5 targeted issues are resolved.

**Files:**
- No code changes — verification only

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 2: Run all unit tests**

Run: `pnpm vitest run lib/workspace/__tests__/docx-cleanup.test.ts`
Expected: All pass

- [ ] **Step 3: Generate a test DOCX via the pipeline**

Start dev server and trigger a DOCX generation:
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; pnpm dev
```
Then in the UI: send a message like "帮我生成一个员工考勤管理系统的需求文档，导出 DOCX"

- [ ] **Step 4: Verify output DOCX quality**

After DOCX is generated, run verification:
```bash
python3 -c "
import re, sys
# Unzip and check
from subprocess import run
run(['unzip', '-qo', '<output.docx>', '-d', '/tmp/verify-output'])
with open('/tmp/verify-output/word/document.xml','r') as f:
    xml = f.read()

rows = re.findall(r'<w:tr\b[\s\S]*?</w:tr>', xml)
empty_rows = sum(1 for r in rows if all(
    not c.replace('<','').replace('>','').strip()
    for c in re.findall(r'<w:tc\b[\s\S]*?</w:tc>', r)
    if not re.sub(r'<[^>]+>', '', c).strip()
) and all(not re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<w:tc\b[\s\S]*?</w:tc>', r)))

text = re.sub(r'<[^>]+>', ' ', xml)
print(f'Empty rows: {empty_rows}')
print(f'Old bank content: {text.count(\"代发管理\")}')
print(f'Leaked instructions: {text.count(\"对每个功能模块进行描述\")}')
print(f'Old image: {1 if \"image4.png\" in xml else 0}')
"
```

Expected: All counts = 0

- [ ] **Step 5: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "fix(docx): resolve empty rows, empty paragraphs, old bank content, and leaked instructions in DOCX export"
```

---

## Out of Scope (Phase 2 Backlog)

These items are noted but deferred:

1. **Multi-feature dynamic injection** — Template only has 2 feature slots. To support N features, `fillDocxTemplate` needs to clone the `3.2.1` XML block for each feature and inject them. This is a significant structural change.

2. **Mermaid → image rendering** — Converting mermaid flowcharts to actual PNG/SVG images and embedding them in the DOCX requires a mermaid renderer (e.g., `@mermaid-js/mermaid-cli`). Adds a dependency.

3. **Dynamic TOC regeneration** — The current approach relies on Word regenerating the TOC when the user opens the file and presses `Ctrl+A → F9`. A code-based TOC generator would be complex and fragile.

4. **Template versioning** — Currently templates live in workspace dirs. A centralized template registry with versioning would prevent drift.
