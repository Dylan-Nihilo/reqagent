import { mkdir, readFile, writeFile, copyFile, stat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const templateSourcePath = path.join(
  repoRoot,
  "docs",
  "templates",
  "retail-crystal-ball-demand-template.md",
);
const sourceDocxPath = path.join(
  repoRoot,
  ".reqagent",
  "workspaces",
  "ws_77420f3f-2cde-47b7-8b0c-c03abe621356-636865ed732e",
  "docs",
  "(零售水晶球三期)202502新增代发管理-非标准化代发业务单位管理需求说明书V1.1_20250106.docx",
);

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(input = new Date()) {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, "0");
  const day = `${input.getDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function buildToc(markdown) {
  const outline = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length ?? 1,
    text: match[2]?.trim() ?? "",
  }));

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

async function buildHtml(markdown) {
  const title =
    markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || "零售业务需求说明书模板";
  const bodyMarkdown = markdown.replace(/^#\s+.+?(?:\r?\n){1,2}/, "");
  const bodyHtml = await marked.parse(bodyMarkdown, { async: false, gfm: true });
  const today = formatDate();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
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
      color: #0f172a;
      margin: 0 0 12pt;
    }
    h1 { font-size: 18pt; margin-top: 24pt; }
    h2 { font-size: 15pt; margin-top: 18pt; }
    h3 { font-size: 13pt; margin-top: 14pt; }
    p, li { margin: 0 0 8pt; }
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
    th { background: #e5edf7; }
    blockquote {
      margin: 10pt 0;
      padding: 8pt 12pt;
      color: #334155;
      border-left: 3pt solid #94a3b8;
      background: #f8fafc;
    }
    .req-cover {
      min-height: 23cm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .req-cover-spacer { flex: 1; }
    .req-cover-title {
      font-size: 24pt;
      line-height: 1.4;
      margin-bottom: 32pt;
      max-width: 85%;
    }
    .req-cover-meta {
      width: 80%;
      text-align: left;
      font-size: 12pt;
      margin: 0 auto 20pt;
    }
    .req-cover-meta p { margin-bottom: 8pt; }
    .req-section { margin: 0; }
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
    .req-toc-dots {
      flex: 1;
      border-bottom: 1px dotted #64748b;
      transform: translateY(-3pt);
    }
    .page-break { page-break-after: always; }
  </style>
</head>
<body>
  <section class="req-cover">
    <div class="req-cover-spacer"></div>
    <h1 class="req-cover-title">${escapeHtml(title)}</h1>
    <div class="req-cover-meta">
      <p><strong>制作单位：</strong>（待填写部门）</p>
      <p><strong>文档版本号：</strong>V1.0</p>
      <p><strong>日期：</strong>${today}</p>
      <p><strong>编写人员：</strong>N.O.V.A.</p>
    </div>
  </section>
  <div class="page-break"></div>
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
          <td>V1.0</td>
          <td>${today}</td>
          <td>全文</td>
          <td>A</td>
          <td>模板初始化</td>
          <td>ReqAgent</td>
        </tr>
      </tbody>
    </table>
  </section>
  <div class="page-break"></div>
  ${buildToc(markdown)}
  <div class="page-break"></div>
  <section class="req-section">
    ${bodyHtml}
  </section>
</body>
</html>`;
}

async function main() {
  const outputDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(
        repoRoot,
        ".reqagent",
        "workspaces",
        "ws_77420f3f-2cde-47b7-8b0c-c03abe621356-636865ed732e",
        "docs",
      );

  await mkdir(outputDir, { recursive: true });

  const markdown = await readFile(templateSourcePath, "utf8");
  const html = await buildHtml(markdown);

  const markdownOutputPath = path.join(outputDir, "零售业务需求说明书_精细模板.md");
  const htmlOutputPath = path.join(outputDir, "零售业务需求说明书_精细模板.tmp.html");
  const docxOutputPath = path.join(outputDir, "零售业务需求说明书_精细模板.docx");
  const sourceCopyPath = path.join(outputDir, "零售业务需求说明书_参考原文.docx");

  await writeFile(markdownOutputPath, markdown, "utf8");
  await writeFile(htmlOutputPath, html, "utf8");
  await execa("textutil", ["-convert", "docx", "-output", docxOutputPath, htmlOutputPath]);
  await copyFile(sourceDocxPath, sourceCopyPath);
  await writeFile(
    path.join(outputDir, "零售业务需求说明书_模板说明.txt"),
    [
      "1. 零售业务需求说明书_精细模板.docx：可直接编辑使用的演示模板。",
      "2. 零售业务需求说明书_精细模板.md：模板源稿，便于继续调整。",
      "3. 零售业务需求说明书_参考原文.docx：水晶球原始需求文档副本，用于对照目录、表格和章节颗粒度。",
    ].join("\n"),
    "utf8",
  );
  const generated = await stat(docxOutputPath);
  await rm(htmlOutputPath, { force: true });
  console.log(`Generated ${docxOutputPath} (${generated.size} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
