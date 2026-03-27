import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, jsonSchema } from "ai";
import { execa } from "execa";
import { DocumentBuilder } from "@/lib/workspace/document-builder";
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
import { DEFAULT_DOCX_TEMPLATE_PATH } from "@/lib/workspace/docx-template-path";

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

const DYNAMIC_FEATURE_BLOCK_SLOT_HINT = 99;

type InitDocumentInput = {
  title: string;
  template_profile_id?: string;
  author?: string;
  version?: string;
  organization?: string;
};

type FeatureFieldInput = {
  field: string;
  type: string;
  required: string;
  enum_values: string;
  note: string;
};

type FillSectionInput = {
  document_id: string;
  section_id: string;
  content: string;
  feature_block?: {
    name: string;
    process_items: string[];
    detail_items: string[];
    rule_items: string[];
    input_table?: FeatureFieldInput[];
    output_table?: FeatureFieldInput[];
  };
  department_records?: Array<{ department: string; duty: string }>;
  term_records?: Array<{ term: string; definition: string }>;
};

type GetDocumentStatusInput = {
  document_id: string;
};

type FinalizeDocumentInput = {
  document_id: string;
  filename?: string;
};

function getSafeDocxName(baseName: string) {
  const safeName = (baseName || "document")
    .replace(/[^\w\u4e00-\u9fff.-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "document";

  return safeName.endsWith(".docx") ? safeName : `${safeName}.docx`;
}

async function resolveDefaultTemplatePath(workspaceDir: string) {
  const repoTemplatePath = DEFAULT_DOCX_TEMPLATE_PATH;
  const fallbackTemplatePath = path.join(workspaceDir, "docs", "用户需求说明书_Base_clean.docx");

  const resolvedTemplatePath = await fs
    .stat(repoTemplatePath)
    .then(() => repoTemplatePath)
    .catch(() => fallbackTemplatePath);

  const templateExists = await fs.stat(resolvedTemplatePath).then(() => true).catch(() => false);
  return templateExists ? resolvedTemplatePath : undefined;
}

function parseFeatureBlockIndex(sectionId: string) {
  const match = sectionId.trim().match(/^3\.2\.(\d+)$/);
  if (!match?.[1]) return undefined;

  return Number.parseInt(match[1], 10);
}

function normalizeText(value?: string) {
  return value
    ?.replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

function countVisibleChars(value: string) {
  return value.replace(/\s+/g, "").trim().length;
}

function normalizeStringArray(values?: string[]) {
  return (values ?? []).map(normalizeText).filter((value): value is string => Boolean(value));
}

function normalizeFeatureTable(records?: FeatureFieldInput[]) {
  return (records ?? []).map((record) => ({
    field: normalizeText(record.field) ?? "",
    type: normalizeText(record.type) ?? "-",
    required: normalizeText(record.required) ?? "-",
    enum_values: normalizeText(record.enum_values) ?? "-",
    note: normalizeText(record.note) ?? "-",
  }));
}

function countFeatureFieldChars(record: FeatureFieldInput) {
  return countVisibleChars(
    `${record.field}${record.type}${record.required}${record.enum_values}${record.note}`,
  );
}

function countFeatureBlockChars(block: NonNullable<FillSectionInput["feature_block"]>) {
  return (
    countVisibleChars(block.name) +
    normalizeStringArray(block.process_items).reduce((sum, item) => sum + countVisibleChars(item), 0) +
    normalizeStringArray(block.detail_items).reduce((sum, item) => sum + countVisibleChars(item), 0) +
    normalizeStringArray(block.rule_items).reduce((sum, item) => sum + countVisibleChars(item), 0) +
    normalizeFeatureTable(block.input_table).reduce((sum, record) => sum + countFeatureFieldChars(record), 0) +
    normalizeFeatureTable(block.output_table).reduce((sum, record) => sum + countFeatureFieldChars(record), 0)
  );
}

function toRatio(actual: number, target: number) {
  if (target <= 0) return actual > 0 ? 1 : 0;
  return Number((actual / target).toFixed(2));
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
        const repoTemplatePath = DEFAULT_DOCX_TEMPLATE_PATH;
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

    init_document: tool({
      description:
        "Create a persisted section-level document builder for long requirements drafts " +
        "and return the template outline in fill order.",
      inputSchema: jsonSchema<InitDocumentInput>({
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Document title used for the builder session and final DOCX cover.",
          },
          template_profile_id: {
            type: "string",
            description: "Semantic DOCX template profile id. Defaults to user-requirements-base-v1.",
          },
          author: {
            type: "string",
            description: "Optional author metadata stored with the builder session.",
          },
          version: {
            type: "string",
            description: "Optional version metadata stored with the builder session.",
          },
          organization: {
            type: "string",
            description: "Optional organization metadata stored with the builder session.",
          },
        },
        required: ["title"],
      }),
      execute: async ({ title, template_profile_id, author, version, organization }) => {
        try {
          const builder = new DocumentBuilder(runtimeContext.workspaceDir, {
            title,
            template_profile_id,
            author,
            version,
            organization,
          });
          await builder.save();

          const outline = builder.getOutline();
          const total_target_chars = outline.reduce((sum, section) => sum + section.target_chars, 0);

          return {
            document_id: builder.id,
            outline,
            feature_block_slots: DYNAMIC_FEATURE_BLOCK_SLOT_HINT,
            total_target_chars,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to initialize document builder",
            title,
          };
        }
      },
    }),

    fill_section: tool({
      description:
        "Fill or overwrite one accumulated document section. Supports standard sections, " +
        "dynamic feature blocks, department records, and term records.",
      inputSchema: jsonSchema<FillSectionInput>({
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "Document builder id returned by init_document.",
          },
          section_id: {
            type: "string",
            description: "Section id to fill, such as 1.1 or feature block id 3.2.1.",
          },
          content: {
            type: "string",
            description: "Markdown body for the section. Use an empty string when only structured records are needed.",
          },
          feature_block: {
            type: "object",
            description: "Feature block payload for dynamic feature sections like 3.2.1.",
            properties: {
              name: { type: "string" },
              process_items: {
                type: "array",
                items: { type: "string" },
              },
              detail_items: {
                type: "array",
                items: { type: "string" },
              },
              rule_items: {
                type: "array",
                items: { type: "string" },
              },
              input_table: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    type: { type: "string" },
                    required: { type: "string" },
                    enum_values: { type: "string" },
                    note: { type: "string" },
                  },
                  required: ["field", "type", "required", "enum_values", "note"],
                },
              },
              output_table: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    field: { type: "string" },
                    type: { type: "string" },
                    required: { type: "string" },
                    enum_values: { type: "string" },
                    note: { type: "string" },
                  },
                  required: ["field", "type", "required", "enum_values", "note"],
                },
              },
            },
            required: ["name", "process_items", "detail_items", "rule_items"],
          },
          department_records: {
            type: "array",
            items: {
              type: "object",
              properties: {
                department: { type: "string" },
                duty: { type: "string" },
              },
              required: ["department", "duty"],
            },
            description: "Structured department ownership rows for section 2.4.",
          },
          term_records: {
            type: "array",
            items: {
              type: "object",
              properties: {
                term: { type: "string" },
                definition: { type: "string" },
              },
              required: ["term", "definition"],
            },
            description: "Structured glossary rows for section 1.4.",
          },
        },
        required: ["document_id", "section_id", "content"],
      }),
      execute: async ({ document_id, section_id, content, feature_block, department_records, term_records }) => {
        try {
          const builder = await DocumentBuilder.load(runtimeContext.workspaceDir, document_id);
          const featureBlockIndex = parseFeatureBlockIndex(section_id);

          if (featureBlockIndex !== undefined) {
            if (!feature_block) {
              return {
                error: "feature_block is required for dynamic feature sections",
                document_id,
                section_id,
              };
            }

            builder.addFeatureBlock({
              index: featureBlockIndex,
              name: feature_block.name,
              process_items: feature_block.process_items,
              detail_items: feature_block.detail_items,
              rule_items: feature_block.rule_items,
              input_table: feature_block.input_table,
              output_table: feature_block.output_table,
            });
            await builder.save();

            const target_chars = builder.getTemplateProfile().featureBlock.targetChars;
            const actual_chars = countFeatureBlockChars(feature_block);
            const ratio = toRatio(actual_chars, target_chars);

            return {
              section_id,
              status: "filled" as const,
              actual_chars,
              target_chars,
              ratio,
              within_range: ratio >= 0.7 && ratio <= 1,
            };
          }

          const result = builder.fillSection(section_id, {
            markdown: content,
            department_records,
            term_records,
          });
          await builder.save();
          return result;
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to fill section",
            document_id,
            section_id,
          };
        }
      },
    }),

    get_document_status: tool({
      description:
        "Load a persisted document builder and return completion status for all accumulated sections.",
      inputSchema: jsonSchema<GetDocumentStatusInput>({
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "Document builder id returned by init_document.",
          },
        },
        required: ["document_id"],
      }),
      execute: async ({ document_id }) => {
        try {
          const builder = await DocumentBuilder.load(runtimeContext.workspaceDir, document_id);
          const status = builder.getStatus();
          await builder.save();
          return status;
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to load document status",
            document_id,
          };
        }
      },
    }),

    finalize_document: tool({
      description:
        "Assemble the accumulated markdown from a persisted builder and export the final DOCX " +
        "through the profile-driven template fill pipeline.",
      inputSchema: jsonSchema<FinalizeDocumentInput>({
        type: "object",
        properties: {
          document_id: {
            type: "string",
            description: "Document builder id returned by init_document.",
          },
          filename: {
            type: "string",
            description: "Optional output filename without extension. Defaults to the document title.",
          },
        },
        required: ["document_id"],
      }),
      execute: async ({ document_id, filename }) => {
        try {
          const builder = await DocumentBuilder.load(runtimeContext.workspaceDir, document_id);
          const status = builder.getStatus();
          const missingRequired = status.pending.filter((section) => section.required);

          if (missingRequired.length > 0) {
            return {
              error: "Cannot finalize document: required sections are still missing",
              document_id,
              missing_sections: missingRequired.map((section) => section.section_id),
            };
          }

          const templatePath = await resolveDefaultTemplatePath(runtimeContext.workspaceDir);
          if (!templatePath) {
            return {
              error: "DOCX template not found",
              document_id,
            };
          }

          const metadata = builder.getMetadata();
          const markdown = builder.toMarkdown();
          const docxName = getSafeDocxName(filename?.trim() || metadata.title || "document");
          const outputDir = path.join(runtimeContext.workspaceDir, "docs");
          const outputPath = path.join(outputDir, docxName);
          const templateBuildResult = buildDocxTemplatePayload(
            markdown,
            metadata.title,
            {
              organization: metadata.organization,
              author: metadata.author,
              version: metadata.version,
            },
            builder.getTemplateProfile().id,
          );
          const fillResult = await fillDocxTemplate({
            templatePath,
            outputPath,
            placeholderValues: templateBuildResult.placeholderValues,
            featureBlocks: templateBuildResult.featureBlocks,
            departmentRecords: templateBuildResult.departmentRecords,
            buildResult: templateBuildResult,
          });
          await builder.save();

          const stat = await fs.stat(outputPath);
          const relativePath = path.relative(runtimeContext.workspaceDir, outputPath).replace(/\\/g, "/");

          return {
            outputPath: relativePath,
            downloadName: docxName,
            qualityReport: fillResult.qualityReport,
            relationIntegrity: fillResult.relationIntegrity,
            sizeBytes: stat.size,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to finalize document",
            document_id,
          };
        }
      },
    }),
  };
}
