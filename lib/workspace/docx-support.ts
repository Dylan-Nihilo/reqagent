import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import { marked } from "marked";
import { resolveWorkspacePath } from "@/lib/workspace/context";

export type DocxStyleSummary = {
  styleId: string;
  name: string;
};

export type DocxHeadingSummary = {
  level: number;
  text: string;
  styleId?: string;
  styleName?: string;
  paragraphIndex: number;
};

export type DocxTableSummary = {
  index: number;
  rowCount: number;
  columnCount: number;
  previewRows: string[][];
};

export type DocxStructureAnalysis = {
  title: string;
  headings: DocxHeadingSummary[];
  tables: DocxTableSummary[];
  styles: DocxStyleSummary[];
  hasToc: boolean;
  sectionCount: number;
  paragraphCount: number;
  tableCount: number;
  charCount: number;
  textContent: string;
};

export type DocxExportSource = {
  markdown: string;
  sourcePath?: string;
  title: string;
  outline: Array<{ level: number; text: string }>;
};

type RenderRequirementsDocHtmlOptions = {
  markdown: string;
  title: string;
  organization?: string;
  author?: string;
  version?: string;
  docDate?: string;
  includeToc?: boolean;
};

const PAGE_BREAK = '<div style="page-break-after: always;"></div>';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractXmlText(xml: string) {
  return normalizeWhitespace(
    decodeXmlEntities(
      xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\/>/g, "\n")
        .replace(/<w:cr\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

async function readZipEntry(docxPath: string, entryPath: string) {
  try {
    const { stdout } = await execa("unzip", ["-p", docxPath, entryPath]);
    return stdout;
  } catch {
    return "";
  }
}

function parseStyleSummaries(stylesXml: string) {
  const summaries: DocxStyleSummary[] = [];

  for (const match of stylesXml.matchAll(
    /<w:style\b[^>]*w:styleId="([^"]+)"[\s\S]*?<w:name\b[^>]*w:val="([^"]+)"/g,
  )) {
    summaries.push({
      styleId: match[1] ?? "",
      name: decodeXmlEntities(match[2] ?? ""),
    });
  }

  return summaries;
}

function inferHeadingLevel(styleName: string | undefined, text: string) {
  const normalizedStyle = styleName?.toLowerCase() ?? "";
  const normalizedText = text.trim();

  const headingMatch = normalizedStyle.match(/heading\s*(\d+)/);
  if (headingMatch) {
    return Number.parseInt(headingMatch[1] ?? "0", 10) || undefined;
  }

  const zhHeadingMatch = normalizedStyle.match(/标题\s*(\d+)/);
  if (zhHeadingMatch) {
    return Number.parseInt(zhHeadingMatch[1] ?? "0", 10) || undefined;
  }

  if (/^第[0-9一二三四五六七八九十]+章/.test(normalizedText)) {
    return 1;
  }

  if (/^\d+\.\d+(\.\d+)*\s*/.test(normalizedText)) {
    return normalizedText.split(".").length;
  }

  return undefined;
}

function buildTocHtml(outline: Array<{ level: number; text: string }>) {
  if (outline.length === 0) {
    return `
      <section class="req-section">
        <h1>目录</h1>
        <p class="req-empty">正文未提供可生成目录的标题。</p>
      </section>
    `;
  }

  const items = outline
    .filter((item) => item.level <= 3)
    .map((item) => {
      const indent = Math.max(0, item.level - 1) * 24;
      return `
        <li class="req-toc-item" style="padding-left:${indent}px;">
          <span class="req-toc-text">${escapeHtml(item.text)}</span>
          <span class="req-toc-dots"></span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="req-section">
      <h1>目录</h1>
      <ol class="req-toc-list">
        ${items}
      </ol>
    </section>
  `;
}

function buildCoverHtml({
  title,
  organization,
  author,
  version,
  docDate,
}: {
  title: string;
  organization?: string;
  author?: string;
  version?: string;
  docDate?: string;
}) {
  return `
    <section class="req-cover">
      <div class="req-cover-spacer"></div>
      <h1 class="req-cover-title">${escapeHtml(title)}</h1>
      <div class="req-cover-meta">
        <p><strong>制作单位：</strong>${escapeHtml(organization ?? "（部门）")}</p>
        <p><strong>文档版本号：</strong>${escapeHtml(version ?? "V1.0")}</p>
        <p><strong>日期：</strong>${escapeHtml(docDate ?? formatDocDate())}</p>
        <p><strong>编写人员：</strong>${escapeHtml(author ?? "ReqAgent")}</p>
      </div>
    </section>
  `;
}

function buildChangeLogHtml(version: string, docDate: string) {
  return `
    <section class="req-section">
      <h1>文档更改记录表</h1>
      <table>
        <thead>
          <tr>
            <th>更改号</th>
            <th>日期</th>
            <th>图号/表号/段落号</th>
            <th>A/M/D</th>
            <th>题目或简短描述</th>
            <th>更改申请号</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(version)}</td>
            <td>${escapeHtml(docDate)}</td>
            <td>全文</td>
            <td>A</td>
            <td>初稿生成</td>
            <td>ReqAgent</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

export function formatDocDate(input = new Date()) {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, "0");
  const day = `${input.getDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export async function analyzeDocxStructure(docxPath: string): Promise<DocxStructureAnalysis> {
  const [documentXml, stylesXml] = await Promise.all([
    readZipEntry(docxPath, "word/document.xml"),
    readZipEntry(docxPath, "word/styles.xml"),
  ]);

  if (!documentXml) {
    throw new Error("Failed to read word/document.xml from DOCX");
  }

  const styles = parseStyleSummaries(stylesXml);
  const styleNameById = new Map(styles.map((style) => [style.styleId, style.name]));

  const headings: DocxHeadingSummary[] = [];
  const textParts: string[] = [];
  let paragraphCount = 0;

  for (const match of documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    paragraphCount += 1;
    const paragraphXml = match[0] ?? "";
    const text = extractXmlText(paragraphXml);
    if (!text) continue;

    textParts.push(text);
    const styleId = paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1];
    const styleName = styleId ? styleNameById.get(styleId) : undefined;
    const level = inferHeadingLevel(styleName, text);

    if (level) {
      headings.push({
        level,
        text,
        styleId,
        styleName,
        paragraphIndex: paragraphCount,
      });
    }
  }

  const tables: DocxTableSummary[] = [];
  let tableIndex = 0;

  for (const match of documentXml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)) {
    tableIndex += 1;
    const tableXml = match[0] ?? "";
    const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rowMatch) => {
      const rowXml = rowMatch[0] ?? "";
      return [...rowXml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cellMatch) =>
        extractXmlText(cellMatch[0] ?? ""),
      );
    });

    const rowCount = rows.length;
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

    tables.push({
      index: tableIndex,
      rowCount,
      columnCount,
      previewRows: rows
        .slice(0, 4)
        .map((row) => row.map((cell) => cell.slice(0, 80))),
    });
  }

  const textContent = textParts.join("\n");
  const title =
    headings.find((heading) => heading.level === 1)?.text ||
    textParts.find((text) => text.length > 0)?.slice(0, 120) ||
    path.basename(docxPath, path.extname(docxPath));

  return {
    title,
    headings,
    tables,
    styles: styles.slice(0, 32),
    hasToc: /TOC\s+\\o/.test(documentXml) || styles.some((style) => /^toc /i.test(style.name)),
    sectionCount: Math.max(1, documentXml.split("<w:sectPr").length - 1),
    paragraphCount,
    tableCount: tables.length,
    charCount: textContent.length,
    textContent,
  };
}

export function buildDocxStructureMarkdown(fileName: string, analysis: DocxStructureAnalysis) {
  const headingLines =
    analysis.headings.length > 0
      ? analysis.headings
          .slice(0, 48)
          .map((heading) => `${"  ".repeat(Math.max(0, heading.level - 1))}- ${heading.text}`)
          .join("\n")
      : "- 未识别到标题层级";

  const styleLines =
    analysis.styles.length > 0
      ? analysis.styles
          .slice(0, 16)
          .map((style) => `- ${style.styleId}: ${style.name}`)
          .join("\n")
      : "- 未识别到样式";

  const tableSections = analysis.tables
    .slice(0, 4)
    .map((table) => {
      const rows = table.previewRows
        .map((row) =>
          row.length > 0
            ? `| ${row.map((cell) => cell || " ").join(" | ")} |`
            : "| |",
        )
        .join("\n");

      return [
        `### 表格 ${table.index}`,
        "",
        `- 行数: ${table.rowCount}`,
        `- 列数: ${table.columnCount}`,
        "",
        rows || "_无预览_",
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# 模板结构: ${fileName}`,
    "",
    `- 标题: ${analysis.title}`,
    `- 字符数: ${analysis.charCount}`,
    `- 段落数: ${analysis.paragraphCount}`,
    `- 表格数: ${analysis.tableCount}`,
    `- 分节数: ${analysis.sectionCount}`,
    `- 目录: ${analysis.hasToc ? "存在" : "未检测到"}`,
    "",
    "## 章节树",
    headingLines,
    "",
    "## 样式摘要",
    styleLines,
    "",
    "## 文本预览",
    "",
    analysis.textContent.slice(0, 3000),
    "",
    tableSections ? "## 表格预览" : "",
    tableSections,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadMarkdownExportSource(input: {
  content?: string;
  sourcePath?: string;
  workspaceDir: string;
}) {
  let markdown = input.content?.trim() ?? "";
  let resolvedSourcePath: string | undefined;

  if (!markdown && input.sourcePath) {
    const resolved = resolveWorkspacePath(input.workspaceDir, input.sourcePath);
    if (!resolved) {
      throw new Error("Access denied: sourcePath outside workspace");
    }
    markdown = (await fs.readFile(resolved, "utf8")).trim();
    resolvedSourcePath = path.relative(input.workspaceDir, resolved).replace(/\\/g, "/");
  }

  if (!markdown) {
    throw new Error("export_docx requires either `content` or `sourcePath`");
  }

  const outline = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length ?? 1,
    text: normalizeWhitespace(match[2] ?? ""),
  }));

  const title =
    outline.find((item) => item.level === 1)?.text ||
    markdown.match(/^(.+)$/m)?.[1]?.trim() ||
    "需求说明书";

  return {
    markdown,
    sourcePath: resolvedSourcePath,
    title,
    outline,
  } satisfies DocxExportSource;
}

function stripLeadingTitleHeading(markdown: string) {
  return markdown.replace(/^#\s+.+?(?:\r?\n){1,2}/, "");
}

export async function renderRequirementsDocHtml(options: RenderRequirementsDocHtmlOptions) {
  const version = options.version?.trim() || "V1.0";
  const docDate = options.docDate?.trim() || formatDocDate();
  const outline = [...options.markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length ?? 1,
    text: normalizeWhitespace(match[2] ?? ""),
  }));
  const markdownBody = stripLeadingTitleHeading(options.markdown);
  const bodyHtml = await marked.parse(markdownBody, { async: false, gfm: true });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @page {
      margin: 2.54cm 3.18cm 2.54cm 3.18cm;
    }
    body {
      font-family: "Songti SC", "STSong", "SimSun", serif;
      color: #111827;
      line-height: 1.8;
      font-size: 12pt;
      margin: 0;
    }
    h1, h2, h3, h4 {
      font-family: "Heiti SC", "STHeiti", "SimHei", sans-serif;
      margin: 0 0 12pt;
      color: #0f172a;
    }
    h1 {
      font-size: 18pt;
      page-break-after: avoid;
      margin-top: 24pt;
    }
    h2 {
      font-size: 15pt;
      margin-top: 18pt;
    }
    h3 {
      font-size: 13pt;
      margin-top: 14pt;
    }
    p, li {
      margin: 0 0 8pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0 18pt;
      font-size: 10.5pt;
    }
    th, td {
      border: 1px solid #111827;
      padding: 6pt 8pt;
      vertical-align: top;
    }
    th {
      background: #e5edf7;
      font-family: "Heiti SC", "STHeiti", "SimHei", sans-serif;
    }
    blockquote {
      margin: 10pt 0;
      padding: 8pt 12pt;
      color: #334155;
      border-left: 3pt solid #94a3b8;
      background: #f8fafc;
    }
    code {
      font-family: "Menlo", "Monaco", monospace;
      font-size: 10pt;
      background: #f3f4f6;
      padding: 1pt 3pt;
      border-radius: 3pt;
    }
    pre {
      background: #f3f4f6;
      padding: 10pt;
      border-radius: 4pt;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .req-cover {
      min-height: 23cm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .req-cover-spacer {
      flex: 1;
    }
    .req-cover-title {
      font-size: 24pt;
      line-height: 1.4;
      margin-bottom: 32pt;
      max-width: 85%;
    }
    .req-cover-meta {
      width: 80%;
      margin: 0 auto 20pt;
      text-align: left;
      font-size: 12pt;
    }
    .req-cover-meta p {
      margin-bottom: 8pt;
    }
    .req-section {
      margin: 0;
    }
    .req-toc-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .req-toc-item {
      display: flex;
      align-items: baseline;
      gap: 8pt;
      margin-bottom: 6pt;
    }
    .req-toc-text {
      white-space: nowrap;
    }
    .req-toc-dots {
      flex: 1;
      border-bottom: 1px dotted #64748b;
      transform: translateY(-3pt);
    }
    .req-empty {
      color: #64748b;
    }
  </style>
</head>
<body>
  ${buildCoverHtml({
    title: options.title,
    organization: options.organization,
    author: options.author,
    version,
    docDate,
  })}
  ${PAGE_BREAK}
  ${buildChangeLogHtml(version, docDate)}
  ${PAGE_BREAK}
  ${options.includeToc === false ? "" : `${buildTocHtml(outline)}${PAGE_BREAK}`}
  <section class="req-section">
    ${bodyHtml}
  </section>
</body>
</html>`;
}

type MarkdownSection = {
  heading: string;
  normalizedHeading: string;
  level: number;
  index: number;
  body: string;
};

type LabeledBlock = {
  label: string;
  normalizedLabel: string;
  body: string;
};

function normalizeHeadingLabel(value: string) {
  return normalizeWhitespace(
    value
      .replace(/^第[0-9一二三四五六七八九十]+章\s*/, "")
      .replace(/^\d+(?:\.\d+)*\s*/, "")
      .replace(/[（(]\s*(?:FR|SR)[-_ ]?\d+\s*[）)]/gi, "")
      .trim(),
  );
}

function normalizeMatchKey(value: string) {
  return normalizeHeadingLabel(value)
    .replace(/[【】[\]()（）]/g, " ")
    .replace(/[：:·、,，/]/g, " ")
    .replace(/\b(?:fr|sr)\s*-?\s*\d+\b/gi, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseMarkdownSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.push({
      heading: currentHeading,
      normalizedHeading: normalizeHeadingLabel(currentHeading),
      level: currentLevel,
      index: sections.length,
      body: currentBody.join("\n").trim(),
    });
  };

  let currentLevel = 1;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      currentLevel = match[1]?.length ?? 1;
      currentHeading = match[2]?.trim() ?? "";
      currentBody = [];
      continue;
    }
    currentBody.push(line);
  }

  flush();
  return sections;
}

function getSectionBody(
  sections: MarkdownSection[],
  normalizedHeading: string,
) {
  return findSectionByCandidates(sections, [normalizedHeading])?.body ?? "";
}

function getSectionBodyByCandidates(
  sections: MarkdownSection[],
  candidates: string[],
) {
  return findSectionByCandidates(sections, candidates)?.body ?? "";
}

function markdownLinesToPlainText(value: string) {
  return value
    .replace(/```mermaid([\s\S]*?)```/gi, (_match, content: string) => {
      const steps = [...content.matchAll(/\[([^\]]+)\]/g)]
        .map((entry) => normalizeWhitespace(entry[1] ?? ""))
        .filter(Boolean);
      return steps.join(" -> ");
    })
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)
    .map((line) =>
      normalizeWhitespace(
        line
          .replace(/^>\s?/, "")
          .replace(/^-\s+\[[ xX]\]\s+/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, "")
          .replace(/^\|\s*/, "")
          .replace(/\s*\|$/g, "")
          .replace(/\s*\|\s*/g, " / ")
          .replace(/[*_`]/g, "")
          .replace(/!\[[^\]]*]\([^)]+\)/g, "")
          .replace(/\[([^\]]+)]\([^)]+\)/g, "$1"),
      ),
    )
    .filter(Boolean)
    .join("；");
}

function parseMarkdownList(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+|^\d+\.\s+|^-\s+\[[ xX]\]\s+/.test(line))
    .map((line) =>
      normalizeWhitespace(
        line
          .replace(/^-\s+\[[ xX]\]\s+/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, ""),
      ),
    );
}

function parseKeyValueLines(body: string) {
  const result: Record<string, string> = {};

  for (const rawLine of body.split(/\r?\n/)) {
    for (const segment of rawLine.split(/[；;]/)) {
      const line = segment.trim().replace(/^[-*+]\s+/, "");
      const match = line.match(/^([^:：]+)[:：]\s*(.+)$/);
      if (!match) continue;
      result[normalizeWhitespace(match[1] ?? "")] = normalizeWhitespace(match[2] ?? "");
    }
  }

  return result;
}

function parseMarkdownTable(body: string) {
  const tableLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (tableLines.length < 2) return [];

  const rows = tableLines
    .filter((line) => !/^\|(?:\s*:?-+:?\s*\|)+$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => normalizeWhitespace(cell)),
    );

  if (rows.length < 2) return [];
  return rows;
}

function getBodyText(
  sections: MarkdownSection[],
  normalizedHeading: string,
) {
  return markdownLinesToPlainText(getSectionBody(sections, normalizedHeading));
}

function getBodyTextByCandidates(
  sections: MarkdownSection[],
  candidates: string[],
) {
  return markdownLinesToPlainText(getSectionBodyByCandidates(sections, candidates));
}

function assignSequence(
  target: Record<string, string>,
  prefix: string,
  values: string[],
  limit: number,
) {
  for (let index = 0; index < limit; index += 1) {
    const value = values[index]?.trim();
    if (value) {
      target[`${prefix}${index + 1}`] = value;
    }
  }
}

function findSectionByCandidates(
  sections: MarkdownSection[],
  candidates: string[],
) {
  let bestMatch: MarkdownSection | undefined;
  let bestScore = -1;

  for (const section of sections) {
    const sectionLabel = section.normalizedHeading;
    const sectionKey = normalizeMatchKey(section.heading);

    for (const candidate of candidates) {
      const candidateLabel = normalizeHeadingLabel(candidate);
      const candidateKey = normalizeMatchKey(candidate);
      if (!candidateKey) continue;

      let score = -1;
      if (sectionLabel === candidateLabel) {
        score = 6;
      } else if (sectionKey === candidateKey) {
        score = 5;
      } else if (sectionKey.includes(candidateKey) || candidateKey.includes(sectionKey)) {
        score = 4;
      } else if (
        sectionLabel.includes(candidateLabel) ||
        candidateLabel.includes(sectionLabel)
      ) {
        score = 3;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = section;
      }
    }
  }

  return bestMatch;
}

function getDescendantSections(
  sections: MarkdownSection[],
  parent: MarkdownSection,
) {
  const descendants: MarkdownSection[] = [];

  for (let index = parent.index + 1; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section) break;
    if (section.level <= parent.level) break;
    descendants.push(section);
  }

  return descendants;
}

function parseLabeledBlocks(body: string) {
  const lines = body.split(/\r?\n/);
  const blocks: LabeledBlock[] = [];
  let currentLabel = "";
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentLabel) return;
    blocks.push({
      label: currentLabel,
      normalizedLabel: normalizeHeadingLabel(currentLabel),
      body: currentBody.join("\n").trim(),
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^\*\*([^*]+?)\*\*[:：]?\s*(.*)$/);

    if (match) {
      flush();
      currentLabel = match[1]?.trim() ?? "";
      currentBody = [];
      if (match[2]?.trim()) {
        currentBody.push(match[2].trim());
      }
      continue;
    }

    if (currentLabel) {
      currentBody.push(rawLine);
    }
  }

  flush();
  return blocks;
}

function findLabeledBlock(
  blocks: LabeledBlock[],
  candidates: string[],
) {
  let bestMatch: LabeledBlock | undefined;
  let bestScore = -1;

  for (const block of blocks) {
    const blockKey = normalizeMatchKey(block.label);

    for (const candidate of candidates) {
      const candidateLabel = normalizeHeadingLabel(candidate);
      const candidateKey = normalizeMatchKey(candidate);
      if (!candidateKey) continue;

      let score = -1;
      if (block.normalizedLabel === candidateLabel) {
        score = 6;
      } else if (blockKey === candidateKey) {
        score = 5;
      } else if (blockKey.includes(candidateKey) || candidateKey.includes(blockKey)) {
        score = 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = block;
      }
    }
  }

  return bestMatch;
}

function uniqueValues(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeMatchKey(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }

  return result;
}

function parsePlainItems(body: string) {
  return uniqueValues(
    markdownLinesToPlainText(body)
      .split(/[；;]/)
      .map((entry) => normalizeWhitespace(entry))
      .filter(Boolean),
  );
}

function parseMarkdownTableRecords(body: string) {
  const rows = parseMarkdownTable(body);
  if (rows.length < 2) return [];

  const headers = rows[0]?.map((cell) => normalizeMatchKey(cell)) ?? [];
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function readTableRecordValue(
  record: Record<string, string>,
  candidates: string[],
  fallbackIndex?: number,
) {
  for (const candidate of candidates) {
    const candidateKey = normalizeMatchKey(candidate);
    const matchedKey = Object.keys(record).find(
      (key) => key === candidateKey || key.includes(candidateKey) || candidateKey.includes(key),
    );
    if (matchedKey && record[matchedKey]) {
      return record[matchedKey];
    }
  }

  if (fallbackIndex === undefined) return "";
  return Object.values(record)[fallbackIndex] ?? "";
}

function extractFeatureName(heading: string) {
  return normalizeWhitespace(
    normalizeHeadingLabel(heading)
      .replace(/^业务功能[一二三四五六七八九十\d]*[：:]\s*/, "")
      .replace(/^功能项[一二三四五六七八九十\d]*[：:]\s*/, "")
      .replace(/^功能[一二三四五六七八九十\d]*[：:]\s*/, "")
      .replace(/[（(]\s*(?:FR|SR)[-_ ]?\d+\s*[）)]/gi, "")
      .trim(),
  );
}

function extractFeatureCode(heading: string) {
  return heading.match(/(?:FR|SR)[-_ ]?(\d+)/i)?.[1] ?? "";
}

function findFeatureSections(sections: MarkdownSection[]) {
  const genericHeadings = new Set(
    [
      "概述",
      "需求背景",
      "业务目标",
      "业务价值",
      "术语",
      "术语定义",
      "业务概述",
      "业务处理流程",
      "现状和存在的问题",
      "我行及同业现状",
      "我行存在的问题",
      "项目参与部门及职责",
      "功能描述",
      "功能分类",
      "标准系统功能描述",
      "特色系统需求",
      "数据要求",
      "非功能及系统级需求",
      "非功能性需求",
      "系统需求",
    ].map((heading) => normalizeMatchKey(heading)),
  );

  return sections.filter((section) => {
    if (section.level < 3) return false;

    const featureName = extractFeatureName(section.heading);
    const featureKey = normalizeMatchKey(featureName);
    if (!featureKey || genericHeadings.has(featureKey)) return false;

    const descendants = getDescendantSections(sections, section);
    const hasStructuredChildren = Boolean(
      findSectionByCandidates(descendants, [
        "业务流程",
        "主流程",
        "流程说明",
        "功能描述",
        "业务功能详述",
        "功能详述",
        "业务规则",
        "异常处理",
        "验收标准",
        "输入要素",
        "输出要素",
      ]),
    );
    const hasLabeledBlocks = Boolean(
      findLabeledBlock(parseLabeledBlocks(section.body), [
        "业务流程",
        "主流程",
        "流程说明",
        "功能描述",
        "业务功能详述",
        "功能详述",
        "业务规则",
        "异常处理",
        "验收标准",
        "输入要素",
        "输出要素",
      ]),
    );

    return (
      /业务功能|功能项|管理|流程|报表|系统|核查|引擎|通知|档案/.test(featureName) &&
      (hasStructuredChildren || hasLabeledBlocks)
    );
  });
}

function collectFeatureItems(
  sections: MarkdownSection[],
  featureSection: MarkdownSection,
  candidates: string[],
) {
  const descendants = getDescendantSections(sections, featureSection);
  const childSection = findSectionByCandidates(descendants, candidates);
  if (childSection) {
    const listItems = parseMarkdownList(childSection.body);
    if (listItems.length > 0) return listItems;
    return parsePlainItems(childSection.body);
  }

  const labeledBlock = findLabeledBlock(parseLabeledBlocks(featureSection.body), candidates);
  if (labeledBlock) {
    const listItems = parseMarkdownList(labeledBlock.body);
    if (listItems.length > 0) return listItems;
    return parsePlainItems(labeledBlock.body);
  }

  return [];
}

function collectFeatureTableRecords(
  sections: MarkdownSection[],
  featureSection: MarkdownSection,
  candidates: string[],
) {
  const descendants = getDescendantSections(sections, featureSection);
  const childSection = findSectionByCandidates(descendants, candidates);
  if (childSection) {
    const records = parseMarkdownTableRecords(childSection.body);
    if (records.length > 0) return records;
  }

  const labeledBlock = findLabeledBlock(parseLabeledBlocks(featureSection.body), candidates);
  if (labeledBlock) {
    const records = parseMarkdownTableRecords(labeledBlock.body);
    if (records.length > 0) return records;
  }

  return [];
}

export function buildTemplatePlaceholderValues(
  markdown: string,
  documentTitle: string,
  metadata?: {
    organization?: string;
    author?: string;
    version?: string;
    docDate?: string;
  },
) {
  const sections = parseMarkdownSections(markdown);
  const placeholders: Record<string, string> = {};
  const normalizedTitle = documentTitle
    .replace(/[-—–]\s*产品需求文档$/i, "")
    .replace(/(?:需求规格说明书|需求说明书|产品需求文档|产品需求说明书|PRD)$/i, "")
    .trim();

  if (normalizedTitle) {
    placeholders["项目名称"] = normalizedTitle;
  }
  if (metadata?.organization?.trim()) placeholders["制作单位"] = metadata.organization.trim();
  if (metadata?.author?.trim()) placeholders["编写人员"] = metadata.author.trim();
  if (metadata?.version?.trim()) placeholders["文档版本号"] = metadata.version.trim();
  if (metadata?.docDate?.trim()) placeholders["日期"] = metadata.docDate.trim();

  placeholders["占位符"] = "请将文中各占位符替换为真实业务内容。";
  const featureSections = findFeatureSections(sections);
  const primaryFeature = featureSections[0];

  const genericProblemSummary = getBodyTextByCandidates(sections, [
    "现状和存在的问题",
    "现状问题",
    "存在的问题",
  ]);
  if (genericProblemSummary) {
    placeholders["现状问题概述"] = genericProblemSummary;
    placeholders["同业现状"] ||= genericProblemSummary;
    placeholders["现存问题"] ||= genericProblemSummary;
  }

  const genericFeatureCategories = getBodyTextByCandidates(sections, [
    "功能分类",
    "功能清单",
    "功能范围",
  ]);
  if (genericFeatureCategories) {
    placeholders["功能分类说明"] = genericFeatureCategories;
  } else if (featureSections.length > 0) {
    placeholders["功能分类说明"] = featureSections
      .slice(0, 8)
      .map((section) => extractFeatureName(section.heading))
      .filter(Boolean)
      .join("；");
  }

  const genericProcess = getBodyTextByCandidates(sections, [
    "业务处理流程",
    "整体流程",
    "业务流程",
  ]);
  if (genericProcess) {
    placeholders["业务处理流程说明"] = genericProcess;
  }

  const genericTerms = getBodyTextByCandidates(sections, ["术语定义", "术语", "名词解释"]);
  if (genericTerms) {
    placeholders["术语内容"] = genericTerms;
  }

  const genericNonFunctional = getBodyTextByCandidates(sections, [
    "非功能性需求",
    "非功能需求",
  ]);
  if (genericNonFunctional) {
    placeholders["非功能性需求"] = genericNonFunctional;
  }

  const genericSystemReq = getBodyTextByCandidates(sections, ["系统需求", "系统级需求"]);
  if (genericSystemReq) {
    placeholders["系统需求"] = genericSystemReq;
  }

  const simpleSectionMappings: Array<{ candidates: string[]; placeholder: string }> = [
    { candidates: ["需求背景", "项目背景", "建设背景"], placeholder: "需求背景" },
    { candidates: ["业务目标", "建设目标", "项目目标"], placeholder: "业务目标" },
    { candidates: ["业务价值", "项目价值", "预期收益"], placeholder: "业务价值" },
    { candidates: ["业务概述", "方案概述", "业务说明"], placeholder: "业务概述" },
    { candidates: ["我行及同业现状", "同业现状", "现状分析"], placeholder: "同业现状" },
    { candidates: ["我行存在的问题", "现存问题", "存在的问题"], placeholder: "现存问题" },
    { candidates: ["支付系统", "支付相关需求"], placeholder: "支付系统需求" },
    { candidates: ["回单系统", "回单相关需求"], placeholder: "回单系统需求" },
    { candidates: ["报表", "报表需求", "统计报表"], placeholder: "报表需求" },
    { candidates: ["询证函需求", "询证函"], placeholder: "询证函需求" },
    { candidates: ["京智柜面需求", "京智柜面"], placeholder: "京智柜面需求" },
    { candidates: ["核算引擎核算规则配置表", "核算引擎需求", "核算引擎"], placeholder: "核算引擎需求" },
    { candidates: ["对手信息", "对手信息需求"], placeholder: "对手信息需求" },
    { candidates: ["通知类业务", "通知类业务需求", "通知需求"], placeholder: "通知类业务需求" },
    { candidates: ["联网核查系统", "联网核查需求", "联网核查"], placeholder: "联网核查需求" },
    { candidates: ["数据挖掘分析需求", "数据分析需求", "数据分析"], placeholder: "数据分析需求" },
  ];

  for (const { candidates, placeholder } of simpleSectionMappings) {
    const value = getBodyTextByCandidates(sections, candidates);
    if (value) {
      placeholders[placeholder] = value;
    }
  }

  const termRows = parseMarkdownTable(getSectionBodyByCandidates(sections, ["术语", "术语定义", "名词解释"])).slice(1, 3);
  termRows.forEach((row, index) => {
    if (row[0]) placeholders[`术语${index + 1}`] = row[0];
    if (row[1]) placeholders[`定义${index + 1}`] = row[1];
  });

  const departmentRecords = parseMarkdownTableRecords(
    getSectionBodyByCandidates(sections, ["项目参与部门及职责", "参与部门及职责", "参与方及职责"]),
  ).slice(0, 3);
  departmentRecords.forEach((record, index) => {
    const department = readTableRecordValue(record, ["部门名称", "参与方", "部门", "机构"], 0);
    const duty = readTableRecordValue(record, ["职责", "责任", "说明"], 1);
    if (department) placeholders[`部门${index + 1}`] = department;
    if (duty) placeholders[`职责${index + 1}`] = duty;
  });

  assignSequence(
    placeholders,
    "功能域",
    parseMarkdownList(getSectionBodyByCandidates(sections, ["功能分类", "功能清单", "功能范围"])),
    12,
  );
  assignSequence(
    placeholders,
    "步骤",
    parseMarkdownList(getSectionBodyByCandidates(sections, ["业务处理流程", "整体流程", "业务流程"])),
    12,
  );

  const featureProcessItems = primaryFeature
    ? collectFeatureItems(sections, primaryFeature, ["业务流程", "主流程", "流程说明"])
    : [];
  const featureDetailItems = primaryFeature
    ? collectFeatureItems(sections, primaryFeature, ["业务功能详述", "功能描述", "功能详述"])
    : [];
  const featureRuleItems = primaryFeature
    ? uniqueValues([
        ...collectFeatureItems(sections, primaryFeature, ["业务规则", "规则说明"]),
        ...collectFeatureItems(sections, primaryFeature, ["异常处理", "异常场景"]),
        ...collectFeatureItems(sections, primaryFeature, ["验收标准", "验收要点"]),
      ])
    : [];

  assignSequence(
    placeholders,
    "业务流程说明",
    featureProcessItems.length > 0
      ? featureProcessItems
      : parseMarkdownList(getSectionBodyByCandidates(sections, ["业务流程", "主流程"])),
    16,
  );
  assignSequence(
    placeholders,
    "功能详述",
    featureDetailItems.length > 0
      ? featureDetailItems
      : parseMarkdownList(getSectionBodyByCandidates(sections, ["业务功能详述", "功能描述", "功能详述"])),
    16,
  );
  assignSequence(
    placeholders,
    "业务规则",
    featureRuleItems.length > 0
      ? featureRuleItems
      : parseMarkdownList(getSectionBodyByCandidates(sections, ["业务规则", "异常处理", "验收标准"])),
    16,
  );
  assignSequence(
    placeholders,
    "待确认事项",
    parseMarkdownList(getSectionBodyByCandidates(sections, ["假设与待确认", "假设", "待确认事项"])),
    3,
  );

  const featureInputRecords = primaryFeature
    ? collectFeatureTableRecords(sections, primaryFeature, ["输入要素", "输入字段", "输入参数"])
    : [];
  const inputRecords =
    featureInputRecords.length > 0
      ? featureInputRecords
      : parseMarkdownTableRecords(getSectionBodyByCandidates(sections, ["输入要素", "输入字段", "输入参数"]));
  inputRecords.forEach((record, index) => {
    const n = index + 1;
    placeholders[`输入字段${n}`] = readTableRecordValue(record, ["字段名称", "字段", "参数名称", "名称"], 1);
    placeholders[`输入类型${n}`] = readTableRecordValue(record, ["类型", "数据类型"], 2);
    placeholders[`输入必填${n}`] = readTableRecordValue(record, ["是否必填", "必填", "必输"], 3);
    placeholders[`输入枚举${n}`] = readTableRecordValue(record, ["枚举值", "取值范围", "值域"], 4);
    placeholders[`输入备注${n}`] = readTableRecordValue(record, ["备注", "说明", "描述"], 5);
  });

  const featureOutputRecords = primaryFeature
    ? collectFeatureTableRecords(sections, primaryFeature, ["输出要素", "输出字段", "输出参数"])
    : [];
  const outputRecords =
    featureOutputRecords.length > 0
      ? featureOutputRecords
      : parseMarkdownTableRecords(getSectionBodyByCandidates(sections, ["输出要素", "输出字段", "输出参数"]));
  outputRecords.forEach((record, index) => {
    const n = index + 1;
    placeholders[`输出字段${n}`] = readTableRecordValue(record, ["字段名称", "字段", "参数名称", "名称"], 1);
    placeholders[`输出类型${n}`] = readTableRecordValue(record, ["类型", "数据类型"], 2);
    placeholders[`输出必填${n}`] = readTableRecordValue(record, ["是否必填", "必填", "必输"], 3);
    placeholders[`输出枚举${n}`] = readTableRecordValue(record, ["枚举值", "取值范围", "值域"], 4);
    placeholders[`输出备注${n}`] = readTableRecordValue(record, ["备注", "说明", "描述"], 5);
  });

  const nonFunctionalRows = parseMarkdownTable(
    getSectionBodyByCandidates(sections, ["非功能性需求", "非功能需求"]),
  ).slice(1);
  for (const row of nonFunctionalRows) {
    const dimension = row[0] ?? "";
    const requirement = row[1] ?? "";
    if (!dimension || !requirement) continue;
    if (dimension === "性能") placeholders["性能要求"] = requirement;
    if (dimension === "安全") placeholders["安全要求"] = requirement;
    if (dimension === "可用性") placeholders["可用性要求"] = requirement;
    if (dimension === "审计") placeholders["审计要求"] = requirement;
    if (dimension === "兼容性") placeholders["兼容性要求"] = requirement;
  }

  const externalData = parseKeyValueLines(getSectionBodyByCandidates(sections, ["是否涉及使用外部数据", "外部数据使用情况"]));
  if (externalData["是否涉及使用外部数据"]) placeholders["外部数据是否使用"] = externalData["是否涉及使用外部数据"];
  if (externalData["外部数据审核编号"]) placeholders["审核编号"] = externalData["外部数据审核编号"];
  if (externalData["外部数据范围说明"]) placeholders["外部数据范围说明"] = externalData["外部数据范围说明"];

  const customerData = parseKeyValueLines(
    getSectionBodyByCandidates(sections, ["外部数据是否含有与客户有关的信息", "客户相关信息"]),
  );
  if (customerData["是否含有客户相关信息"]) placeholders["外部数据含客信息"] = customerData["是否含有客户相关信息"];
  if (customerData["授权方式描述"]) placeholders["授权方式"] = customerData["授权方式描述"];
  if (customerData["不需要授权时的说明"]) placeholders["无需授权说明"] = customerData["不需要授权时的说明"];

  const regulatory = parseKeyValueLines(getSectionBodyByCandidates(sections, ["是否涉及监管报送", "监管报送"]));
  if (regulatory["是否影响监管报送"]) placeholders["监管报送影响"] = regulatory["是否影响监管报送"];
  if (regulatory["涉及报送系统"]) placeholders["系统名称"] = regulatory["涉及报送系统"];
  if (regulatory["影响的表和字段范围"]) placeholders["字段范围"] = regulatory["影响的表和字段范围"];
  if (regulatory["逻辑调整方案"]) placeholders["调整方案"] = regulatory["逻辑调整方案"];

  const classification = parseKeyValueLines(
    getSectionBodyByCandidates(sections, ["是否落实数据分级分类管控要求", "数据分级分类管控要求"]),
  );
  if (classification["是否已落实数据分级分类"]) placeholders["数据分级落实"] = classification["是否已落实数据分级分类"];
  if (classification["具体控制措施"]) placeholders["控制措施"] = classification["具体控制措施"];

  const systemRequirements = parseKeyValueLines(getSectionBodyByCandidates(sections, ["系统需求", "系统级需求"]));
  if (systemRequirements["部署要求"]) placeholders["部署要求"] = systemRequirements["部署要求"];
  if (systemRequirements["依赖系统"]) placeholders["依赖系统"] = systemRequirements["依赖系统"];
  if (systemRequirements["接口要求"]) placeholders["接口要求"] = systemRequirements["接口要求"];
  if (systemRequirements["监控告警"]) placeholders["监控要求"] = systemRequirements["监控告警"];
  if (systemRequirements["灾备要求"]) placeholders["灾备要求"] = systemRequirements["灾备要求"];

  if (featureSections[0]) {
    placeholders["功能名称1"] = extractFeatureName(featureSections[0].heading);
    placeholders["功能编号1"] = extractFeatureCode(featureSections[0].heading) || "001";
  }
  if (featureSections[1]) {
    placeholders["功能名称2"] = extractFeatureName(featureSections[1].heading);
    placeholders["功能编号2"] = extractFeatureCode(featureSections[1].heading) || "002";
  }

  if (!placeholders["功能名称1"]) {
    const firstFeature = sections.find((section) => /^3\.2\.1\s+/.test(section.heading) || /^功能项[：:]/.test(section.heading));
    if (firstFeature) {
      placeholders["功能名称1"] = extractFeatureName(firstFeature.heading);
      placeholders["功能编号1"] = extractFeatureCode(firstFeature.heading) || "001";
    }
  }

  placeholders["校对人员"] ||= metadata?.author?.trim() || "";
  placeholders["签署日期"] ||= metadata?.docDate?.trim() || "";
  placeholders["变更1_1"] ||= metadata?.version?.trim() || "V1.0";
  placeholders["变更1_2"] ||= metadata?.docDate?.trim() || "";
  placeholders["变更1_3"] ||= "全文";
  placeholders["变更1_4"] ||= "A";
  placeholders["变更1_5"] ||= "初稿生成";
  placeholders["变更1_6"] ||= metadata?.author?.trim() || "ReqAgent";

  return placeholders;
}

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

export async function fillDocxTemplate(params: {
  templatePath: string;
  outputPath: string;
  placeholderValues: Record<string, string>;
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reqagent-docx-template-"));

  try {
    await execa("unzip", ["-q", params.templatePath, "-d", tempDir]);
    const documentXmlPath = path.join(tempDir, "word", "document.xml");
    let documentXml = await fs.readFile(documentXmlPath, "utf8");

    for (const [key, rawValue] of Object.entries(params.placeholderValues)) {
      const normalizedValue = rawValue.trim();
      if (!normalizedValue) continue;
      documentXml = documentXml.split(`{{${key}}}`).join(escapeXmlText(normalizedValue));
    }

    documentXml = documentXml.replace(/\{\{[^{}]+\}\}/g, "");

    await fs.writeFile(documentXmlPath, documentXml, "utf8");
    await fs.rm(params.outputPath, { force: true });
    await execa("zip", ["-qr", params.outputPath, "."], { cwd: tempDir });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
