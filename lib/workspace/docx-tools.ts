import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, jsonSchema } from "ai";
import { execa } from "execa";
import type { RuntimeContext } from "@/lib/workspace/context";
import { resolveWorkspacePath } from "@/lib/workspace/context";
import {
  analyzeDocxStructure,
  buildDocxStructureMarkdown,
  buildDocxTemplatePayload,
  fillDocxTemplate,
  loadMarkdownExportSource,
  renderRequirementsDocHtml,
} from "@/lib/workspace/docx-support";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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
        "Read a .docx file and extract detailed structure including headings, " +
        "tables, styles, TOC presence, and plain text content from OOXML.",
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

        try {
          const analysis = await analyzeDocxStructure(resolved);
          const relativePath = path.relative(runtimeContext.workspaceDir, resolved).replace(/\\/g, "/");

          return {
            path: relativePath,
            title: analysis.title,
            headings: analysis.headings.map((heading) => heading.text),
            headingTree: analysis.headings,
            tables: analysis.tables,
            styles: analysis.styles,
            hasToc: analysis.hasToc,
            sectionCount: analysis.sectionCount,
            paragraphCount: analysis.paragraphCount,
            tableCount: analysis.tableCount,
            textContent: analysis.textContent.slice(0, 8000),
            charCount: analysis.charCount,
            sectionCharCounts: analysis.sectionCharCounts,
            relationIntegrity: analysis.relationIntegrity,
            legacyContentHits: analysis.legacyContentHits,
            structureMarkdown: buildDocxStructureMarkdown(path.basename(relativePath), analysis),
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to parse docx",
            path: targetPath,
          };
        }
      },
    }),

    export_docx: tool({
      description:
        "Export Markdown to .docx. Prefer passing sourcePath to a workspace markdown " +
        "file instead of large inline content. Applies an enterprise-style requirements " +
        "document shell with cover, change log, and TOC.",
      inputSchema: jsonSchema<{
        content?: string;
        sourcePath?: string;
        filename?: string;
        title?: string;
        organization?: string;
        author?: string;
        version?: string;
        docDate?: string;
        includeToc?: boolean;
        templatePath?: string;
        templateProfileId?: string;
      }>({
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Markdown content to export as .docx. Use sourcePath when possible.",
          },
          sourcePath: {
            type: "string",
            description: "Relative path to a markdown file in the workspace to export.",
          },
          filename: {
            type: "string",
            description:
              "Output filename without extension (default: 'document'). " +
              "The .docx extension is added automatically.",
          },
          title: {
            type: "string",
            description: "Document title shown on the cover page.",
          },
          organization: {
            type: "string",
            description: "Producing department or organization shown on the cover page.",
          },
          author: {
            type: "string",
            description: "Author name shown on the cover page.",
          },
          version: {
            type: "string",
            description: "Version string used on the cover and change log table.",
          },
          docDate: {
            type: "string",
            description: "Document date in YYYY/MM/DD format.",
          },
          includeToc: {
            type: "boolean",
            description: "Whether to include a generated directory page (default: true).",
          },
          templatePath: {
            type: "string",
            description:
              "Optional relative path to a DOCX template containing placeholders like {{需求背景}}. " +
              "When provided, export_docx fills the template instead of rendering from HTML.",
          },
          templateProfileId: {
            type: "string",
            description:
              "Semantic DOCX template profile id. Defaults to user-requirements-base-v1 and controls section rules, density, and quality checks.",
          },
        },
      }),
      execute: async ({
        content,
        sourcePath,
        filename,
        title,
        organization,
        author,
        version,
        docDate,
        includeToc,
        templatePath,
        templateProfileId,
      }) => {
        let documentSource;
        try {
          documentSource = await loadMarkdownExportSource({
            content,
            sourcePath,
            workspaceDir: runtimeContext.workspaceDir,
          });
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to load markdown source",
            filename: filename ?? "document.docx",
            sourcePath,
          };
        }

        const docTitle = title?.trim() || documentSource.title || "需求说明书";
        const safeName = (filename || docTitle || "document")
          .replace(/[^\w\u4e00-\u9fff.-]/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || "document";
        const docxName = safeName.endsWith(".docx") ? safeName : `${safeName}.docx`;
        const outputDir = path.join(runtimeContext.workspaceDir, "docs");
        const htmlPath = path.join(outputDir, `${safeName}.tmp.html`);
        const docxPath = path.join(outputDir, docxName);
        const requestedTemplatePath = templatePath?.trim();
        const repoTemplatePath = path.join(process.cwd(), "docs", "用户需求说明书_Base_clean.docx");
        const fallbackTemplatePath = path.join(
          runtimeContext.workspaceDir,
          "docs",
          "用户需求说明书_Base_clean.docx",
        );
        const resolvedTemplatePath = requestedTemplatePath
          ? resolveWorkspacePath(runtimeContext.workspaceDir, requestedTemplatePath)
          : (await fs
              .stat(repoTemplatePath)
              .then(() => repoTemplatePath)
              .catch(() => fallbackTemplatePath));
        const templateRelativePath = requestedTemplatePath
          ? requestedTemplatePath
          : resolvedTemplatePath
            ? path.relative(runtimeContext.workspaceDir, resolvedTemplatePath).replace(/\\/g, "/")
            : undefined;

        try {
          if (resolvedTemplatePath) {
            const templateExists = await fs.stat(resolvedTemplatePath).then(() => true).catch(() => false);

            if (templateExists) {
              const templateBuildResult = buildDocxTemplatePayload(
                documentSource.markdown,
                docTitle,
                {
                  organization,
                  author,
                  version,
                  docDate,
                },
                templateProfileId,
              );
              const fillResult = await fillDocxTemplate({
                templatePath: resolvedTemplatePath,
                outputPath: docxPath,
                placeholderValues: templateBuildResult.placeholderValues,
                featureBlocks: templateBuildResult.featureBlocks,
                departmentRecords: templateBuildResult.departmentRecords,
                buildResult: templateBuildResult,
              });

              const stat = await fs.stat(docxPath);
              const relativePath = path.relative(runtimeContext.workspaceDir, docxPath).replace(/\\/g, "/");

              return {
                outputPath: relativePath,
                downloadName: docxName,
                title: docTitle,
                sourcePath: documentSource.sourcePath,
                templatePath: templateRelativePath,
                templateProfileId: templateProfileId?.trim() || "user-requirements-base-v1",
                previewMarkdown: documentSource.markdown.slice(0, 4000),
                sizeBytes: stat.size,
                qualityReport: fillResult.qualityReport,
                relationIntegrity: fillResult.relationIntegrity,
              };
            }
          }

          const fullHtml = await renderRequirementsDocHtml({
            markdown: documentSource.markdown,
            title: docTitle,
            organization,
            author,
            version,
            docDate,
            includeToc,
          });

          // Convert HTML to DOCX via textutil (array args — safe)
          await writeHtmlAsDocx({ html: fullHtml, htmlPath, docxPath });

          const stat = await fs.stat(docxPath);
          const relativePath = path.relative(runtimeContext.workspaceDir, docxPath).replace(/\\/g, "/");

          return {
            outputPath: relativePath,
            downloadName: docxName,
            title: docTitle,
            sourcePath: documentSource.sourcePath,
            templatePath: undefined,
            previewMarkdown: documentSource.markdown.slice(0, 4000),
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
