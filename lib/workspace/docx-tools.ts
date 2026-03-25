import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, jsonSchema } from "ai";
import { execa } from "execa";
import { marked } from "marked";
import type { RuntimeContext } from "@/lib/workspace/context";
import { resolveWorkspacePath } from "@/lib/workspace/context";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtmlDocument(bodyHtml: string, title: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1f2937;
      margin: 48px 56px;
      line-height: 1.7;
      font-size: 13px;
    }
    h1, h2, h3, h4 { color: #111827; }
    h1 { font-size: 26px; text-align: center; margin-top: 48px; margin-bottom: 24px; }
    h2 { margin-top: 32px; border-bottom: 1px solid #d1d5db; padding-bottom: 8px; font-size: 20px; }
    h3 { margin-top: 20px; font-size: 16px; }
    h4 { margin-top: 16px; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; }
    ul, ol { margin: 8px 0 16px 20px; }
    code { background: #f3f4f6; padding: 2px 4px; border-radius: 3px; font-size: 12px; }
    pre { background: #f3f4f6; padding: 12px; border-radius: 4px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #d1d5db; margin: 12px 0; padding: 8px 16px; color: #6b7280; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Convert HTML to DOCX using macOS textutil.
 * Uses execa with array arguments to prevent command injection.
 */
async function writeHtmlAsDocx({
  html,
  htmlPath,
  docxPath,
}: {
  html: string;
  htmlPath: string;
  docxPath: string;
}) {
  await fs.mkdir(path.dirname(htmlPath), { recursive: true });
  await fs.mkdir(path.dirname(docxPath), { recursive: true });
  await fs.writeFile(htmlPath, html, "utf8");
  // execa with array args — safe against shell injection
  await execa("textutil", ["-convert", "docx", "-output", docxPath, htmlPath]);
}

// ---------------------------------------------------------------------------
// Tool builder
// ---------------------------------------------------------------------------

export function buildDocxTools(runtimeContext: RuntimeContext) {
  return {
    parse_docx: tool({
      description:
        "Read a .docx file and extract its text content and heading structure. " +
        "Uses macOS textutil to convert docx to html, then extracts headings and text.",
      inputSchema: jsonSchema<{ path: string }>({
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative path to the .docx file in the workspace",
          },
        },
        required: ["path"],
      }),
      execute: async ({ path: targetPath }) => {
        const resolved = resolveWorkspacePath(runtimeContext.workspaceDir, targetPath);
        if (!resolved) {
          return { error: "Access denied: path outside workspace", path: targetPath };
        }

        try {
          await fs.access(resolved);
        } catch {
          return { error: "File not found", path: targetPath };
        }

        if (!resolved.toLowerCase().endsWith(".docx")) {
          return { error: "Not a .docx file", path: targetPath };
        }

        const tmpHtml = `${resolved}.tmp.html`;
        try {
          // execa with array args — safe against shell injection
          await execa("textutil", ["-convert", "html", "-output", tmpHtml, resolved]);
          const htmlContent = await fs.readFile(tmpHtml, "utf8");

          // Extract headings from HTML
          const headingPattern = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
          const headings: string[] = [];
          let match: RegExpExecArray | null;
          while ((match = headingPattern.exec(htmlContent)) !== null) {
            const text = (match[1] ?? "").replace(/<[^>]*>/g, "").trim();
            if (text) headings.push(text);
          }

          // Extract plain text by stripping tags
          const textContent = htmlContent
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, " ")
            .trim();

          return {
            path: path.relative(runtimeContext.workspaceDir, resolved).replace(/\\/g, "/"),
            headings,
            textContent: textContent.slice(0, 8000),
            htmlContent: htmlContent.slice(0, 16000),
            charCount: textContent.length,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to parse docx",
            path: targetPath,
          };
        } finally {
          await fs.unlink(tmpHtml).catch(() => {});
        }
      },
    }),

    export_docx: tool({
      description:
        "Export Markdown content as a .docx file. Converts markdown to HTML to docx " +
        "using the marked library and macOS textutil. Returns the output path for download.",
      inputSchema: jsonSchema<{ content: string; filename?: string }>({
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Markdown content to export as .docx",
          },
          filename: {
            type: "string",
            description:
              "Output filename without extension (default: 'document'). " +
              "The .docx extension is added automatically.",
          },
        },
        required: ["content"],
      }),
      execute: async ({ content, filename }) => {
        const safeName = (filename || "document")
          .replace(/[^\w\u4e00-\u9fff.-]/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || "document";
        const docxName = safeName.endsWith(".docx") ? safeName : `${safeName}.docx`;
        const outputDir = path.join(runtimeContext.workspaceDir, "docs");
        const htmlPath = path.join(outputDir, `${safeName}.tmp.html`);
        const docxPath = path.join(outputDir, docxName);

        // Extract title from first heading
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1]?.trim() || safeName;

        try {
          // Convert markdown to HTML
          const bodyHtml = await marked.parse(content, { async: false, gfm: true });
          const fullHtml = wrapHtmlDocument(bodyHtml, title);

          // Convert HTML to DOCX via textutil (array args — safe)
          await writeHtmlAsDocx({ html: fullHtml, htmlPath, docxPath });

          const stat = await fs.stat(docxPath);
          const relativePath = path.relative(runtimeContext.workspaceDir, docxPath).replace(/\\/g, "/");

          return {
            outputPath: relativePath,
            downloadName: docxName,
            previewMarkdown: content.slice(0, 2000),
            sizeBytes: stat.size,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to export docx",
            filename: docxName,
          };
        } finally {
          await fs.unlink(htmlPath).catch(() => {});
        }
      },
    }),
  };
}
