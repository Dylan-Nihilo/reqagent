"use client";

import { useMemo } from "react";
import { useThread } from "@assistant-ui/react";
import { parseToolArgsText } from "@/lib/types";
import { getReqAgentEnvelope } from "@/lib/workspace/tool-envelope";
import { readMessageParts } from "@/lib/ui-message-utils";

export type ReqArtifactKind = "brief" | "stories" | "document" | "knowledge";
export type ReqArtifactIconName = "brief" | "stories" | "document" | "knowledge" | "docx";
export type ReqArtifactPreviewMode = "markdown" | "code" | "text";

export type ReqArtifactItem = {
  id: string;
  kind: ReqArtifactKind;
  icon: ReqArtifactIconName;
  label: string;
  summary: string;
  meta: string;
  markdown: string;
  previewMode: ReqArtifactPreviewMode;
  exportName: string;
  toolName: string;
  order: number;
  /** Server-side download URL for binary artifacts (e.g. .docx). */
  downloadUrl?: string;
};

export type ReqPendingArtifact = {
  id: string;
  kind: ReqArtifactKind;
  icon: ReqArtifactIconName;
  label: string;
  summary: string;
  toolName: string;
};

type ThreadMessageLike = {
  role?: unknown;
  content?: unknown;
  parts?: unknown;
};

type ToolCallPartLike = {
  type?: unknown;
  toolName?: unknown;
  toolCallId?: unknown;
  args?: unknown;
  argsText?: unknown;
  result?: unknown;
  status?: unknown;
};

type ArtifactCollection = {
  items: ReqArtifactItem[];
  pending: ReqPendingArtifact | null;
};

export function useArtifacts(workspaceId?: string): ArtifactCollection {
  const messages = useThread((state) => state.messages);

  return useMemo(() => deriveArtifacts(messages as readonly ThreadMessageLike[], workspaceId), [messages, workspaceId]);
}

function deriveArtifacts(messages: readonly ThreadMessageLike[], workspaceId?: string): ArtifactCollection {
  const itemsById = new Map<string, ReqArtifactItem>();
  let latestPending: ReqPendingArtifact | null = null;
  let order = 0;

  for (const message of messages) {
    if (message?.role !== "assistant") continue;
    const parts = readMessageParts(message);
    if (parts.length === 0) continue;

    for (const part of parts) {
      if (!isToolCallPart(part)) continue;

      order += 1;
      const args = getToolArgs(part);
      const result = hasOwn(part, "result") ? part.result : undefined;
      const statusType = getStatusType(part.status);

      const readyArtifact = buildArtifact({
        toolName: normalizeString(part.toolName),
        toolCallId: normalizeString(part.toolCallId) || `tool-${order}`,
        args,
        result,
        order,
        workspaceId,
      });

      if (readyArtifact && result !== undefined) {
        itemsById.set(readyArtifact.id, readyArtifact);
        continue;
      }

      if (isPendingStatus(statusType)) {
        const pendingArtifact = buildPendingArtifact({
          toolName: normalizeString(part.toolName),
          toolCallId: normalizeString(part.toolCallId) || `pending-${order}`,
          args,
        });

        if (pendingArtifact) {
          latestPending = pendingArtifact;
        }
      }
    }
  }

  return {
    items: [...itemsById.values()].sort((left, right) => right.order - left.order),
    pending: latestPending,
  };
}

function buildArtifact({
  toolName,
  toolCallId,
  args,
  result,
  order,
  workspaceId,
}: {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown> | null;
  result: unknown;
  order: number;
  workspaceId?: string;
}): ReqArtifactItem | null {
  const output = asRecord(result);
  const envelopeArtifact = buildArtifactFromEnvelope(result, toolCallId, toolName, order, workspaceId);
  if (envelopeArtifact) {
    return envelopeArtifact;
  }

  switch (toolName) {
    case "analyze_requirements":
    case "parse_input":
    case "parseInput":
      return buildBriefArtifact(output, toolCallId, toolName, order);
    case "generate_stories":
    case "generateStories":
      return buildStoriesArtifact(output, toolCallId, toolName, order);
    case "generate_document":
    case "generateDoc":
      return buildDocumentArtifactFromOutput(output, toolCallId, toolName, order);
    case "writeFile":
      return buildDocumentArtifactFromWrite(args, output, toolCallId, toolName, order);
    case "readFile":
      return buildDocumentArtifactFromRead(output, toolCallId, toolName, order);
    case "export_docx":
      return buildDocxExportArtifact(output, toolCallId, toolName, order, workspaceId);
    case "parse_docx":
      return buildDocxParseArtifact(output, toolCallId, toolName, order);
    case "search_knowledge":
      return buildKnowledgeArtifact(output, toolCallId, toolName, order);
    case "fetch_url":
      return buildFetchedReferenceArtifact(output, toolCallId, toolName, order);
    default:
      return null;
  }
}

function buildArtifactFromEnvelope(
  result: unknown,
  toolCallId: string,
  toolName: string,
  order: number,
  workspaceId?: string,
): ReqArtifactItem | null {
  const envelope = getReqAgentEnvelope(result);
  const artifact = envelope?.artifact;
  if (!artifact) return null;

  const previewMode = artifact.previewMode
    ?? inferArtifactPreviewMode(artifact.path || artifact.downloadPath || artifact.label);
  const downloadUrl = artifact.downloadPath && workspaceId
    ? `/api/workspace/download?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(artifact.downloadPath)}`
    : undefined;
  const metaParts = [
    artifact.path,
    artifact.downloadPath && artifact.downloadPath !== artifact.path ? artifact.downloadPath : null,
    ...Object.entries(envelope?.metrics ?? {})
      .slice(0, 2)
      .map(([key, value]) => `${key} ${String(value)}`),
  ].filter((value): value is string => Boolean(value));
  const normalizedKind = artifact.kind === "knowledge" || artifact.kind === "catalog"
    ? "knowledge"
    : "document";
  const normalizedIcon = artifact.icon
    ?? (artifact.downloadPath?.toLowerCase().endsWith(".docx")
      ? "docx"
      : normalizedKind === "knowledge"
        ? "knowledge"
        : "document");
  const exportName = fileNameFromPath(artifact.downloadPath || artifact.path || `${toolName}.md`);

  return {
    id: `artifact:${toolCallId}:${artifact.downloadPath || artifact.path || toolName}`,
    kind: normalizedKind,
    icon: normalizedIcon,
    label: artifact.label,
    summary: artifact.summary,
    meta: metaParts.join(" · ") || toolName,
    markdown: artifact.content || (artifact.downloadPath ? `*已生成 ${exportName}*` : artifact.summary),
    previewMode,
    exportName,
    toolName,
    order,
    downloadUrl,
  };
}

function buildPendingArtifact({
  toolName,
  toolCallId,
  args,
}: {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown> | null;
}): ReqPendingArtifact | null {
  switch (toolName) {
    case "analyze_requirements":
    case "parse_input":
    case "parseInput":
      return {
        id: `pending:${toolCallId}`,
        kind: "brief",
        icon: "brief",
        label: "需求分析",
        summary: "正在提炼需求结构…",
        toolName,
      };
    case "generate_stories":
    case "generateStories":
      return {
        id: `pending:${toolCallId}`,
        kind: "stories",
        icon: "stories",
        label: "用户故事",
        summary: "正在拆解用户故事…",
        toolName,
      };
    case "generate_document":
    case "generateDoc":
      return {
        id: `pending:${toolCallId}`,
        kind: "document",
        icon: "document",
        label: "需求文档",
        summary: "正在生成文档…",
        toolName,
      };
    case "writeFile": {
      const targetPath = normalizeString(args?.path);
      if (!targetPath) return null;
      const previewMode = inferArtifactPreviewMode(targetPath);
      return {
        id: `pending:${toolCallId}`,
        kind: "document",
        icon: "document",
        label: buildWritableArtifactLabel(targetPath, previewMode),
        summary: `正在写入 ${targetPath}…`,
        toolName,
      };
    }
    case "export_docx":
      return {
        id: `pending:${toolCallId}`,
        kind: "document",
        icon: "docx",
        label: "DOCX 文档",
        summary: "正在生成 DOCX 文档…",
        toolName,
      };
    case "parse_docx":
      return {
        id: `pending:${toolCallId}`,
        kind: "knowledge",
        icon: "knowledge",
        label: "读取模板",
        summary: "正在解析 DOCX 文件…",
        toolName,
      };
    case "search_knowledge":
    case "fetch_url":
      return {
        id: `pending:${toolCallId}`,
        kind: "knowledge",
        icon: "knowledge",
        label: "知识参考",
        summary: "正在整理参考资料…",
        toolName,
      };
    default:
      return null;
  }
}

function buildBriefArtifact(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  if (!output) return null;

  const projectName = normalizeString(output.projectName) || "未命名项目";
  const users = arrayOfStrings(output.targetUsers);
  const features = arrayOfStrings(output.coreFeatures);
  const ambiguities = arrayOfStrings(output.ambiguities);

  return {
    id: "artifact:brief",
    kind: "brief",
    icon: "brief",
    label: "需求分析",
    summary: projectName,
    meta: `${users.length} 类用户 · ${features.length} 项核心功能`,
    markdown: [
      `# ${projectName}`,
      "",
      "## 目标用户",
      listOrFallback(users, "未提炼"),
      "",
      "## 核心功能",
      listOrFallback(features, "未提炼"),
      "",
      "## 约束条件",
      listOrFallback(arrayOfStrings(output.constraints), "未提炼"),
      "",
      "## 歧义项",
      listOrFallback(ambiguities, "暂无"),
    ].join("\n"),
    previewMode: "markdown",
    exportName: `${slugify(projectName)}-analysis.md`,
    toolName,
    order,
  };
}

function buildStoriesArtifact(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  if (!output) return null;

  const projectName = normalizeString(output.projectName) || "未命名项目";
  const stories = arrayOfRecords(output.stories);
  const total = normalizeNumber(output.total) ?? stories.length;
  const summary = asRecord(output.summary);
  const must = normalizeNumber(summary?.must) ?? 0;
  const should = normalizeNumber(summary?.should) ?? 0;

  return {
    id: "artifact:stories",
    kind: "stories",
    icon: "stories",
    label: "用户故事",
    summary: projectName,
    meta: `${formatCount(total)} 条 · must ${must} / should ${should}`,
    markdown: [
      `# ${projectName} 用户故事`,
      "",
      ...stories.flatMap((story, index) => {
        const criteria = arrayOfStrings(story.acceptanceCriteria);
        const priority = normalizeString(story.priority).toUpperCase() || "UNSPECIFIED";
        return [
          `## ${index + 1}. ${normalizeString(story.role) || "用户角色"} · ${priority}`,
          "",
          `- Want: ${normalizeString(story.want) || "未填写"}`,
          `- So that: ${normalizeString(story.soThat) || "未填写"}`,
          "",
          "### Acceptance Criteria",
          criteria.length > 0 ? criteria.map((item) => `- ${item}`).join("\n") : "- 未填写",
          "",
        ];
      }),
    ].join("\n"),
    previewMode: "markdown",
    exportName: `${slugify(projectName)}-stories.md`,
    toolName,
    order,
  };
}

function buildDocumentArtifactFromOutput(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  if (!output) return null;

  const content = normalizeString(output.content);
  if (!content) return null;

  const projectName = normalizeString(output.projectName) || headingFromMarkdown(content) || "需求文档";
  const charCount = normalizeNumber(output.charCount) ?? content.length;

  return {
    id: "artifact:document",
    kind: "document",
    icon: "document",
    label: "需求文档",
    summary: projectName,
    meta: `${formatCount(charCount)} chars · Markdown`,
    markdown: content,
    previewMode: "markdown",
    exportName: `${slugify(projectName)}-requirements.md`,
    toolName,
    order,
  };
}

function buildDocumentArtifactFromWrite(
  args: Record<string, unknown> | null,
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  const targetPath = normalizeString(args?.path);
  const content = asString(args?.content);
  const mode = normalizeString(output?.mode) || "overwrite";

  if (!targetPath || !content) return null;

  const previewMode = inferArtifactPreviewMode(targetPath);
  const title = buildWritableArtifactLabel(targetPath, previewMode);
  const charCount = normalizeNumber(output?.charCount) ?? content.length;
  const sizeBytes = normalizeNumber(output?.sizeBytes);

  return {
    id: `artifact:document:${targetPath}`,
    kind: "document",
    icon: "document",
    label: title,
    summary: buildWritableArtifactSummary(targetPath, content, previewMode),
    meta: buildWritableArtifactMeta({ charCount, mode, path: targetPath, sizeBytes }),
    markdown: content,
    previewMode,
    exportName: fileNameFromPath(targetPath),
    toolName,
    order,
  };
}

function buildDocumentArtifactFromRead(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  if (!output) return null;

  const targetPath = normalizeString(output.path);
  const content = asString(output.content);
  if (!targetPath.toLowerCase().endsWith(".md") || !content) return null;

  return {
    id: `artifact:document:${targetPath}`,
    kind: "document",
    icon: "document",
    label: targetPath.includes("requirements") ? "需求文档" : fileNameFromPath(targetPath),
    summary: headingFromMarkdown(content) || targetPath,
    meta: `${formatCount(normalizeNumber(output.charCount) ?? content.length)} chars · ${targetPath}`,
    markdown: content,
    previewMode: "markdown",
    exportName: fileNameFromPath(targetPath),
    toolName,
    order,
  };
}

function buildKnowledgeArtifact(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  if (!output) return null;

  const pattern = normalizeString(output.pattern);
  if (!pattern) return null;

  const source = normalizeString(output.source) || "knowledge";
  const relevance = normalizeNumber(output.relevance);

  return {
    id: `artifact:knowledge:${toolCallId}`,
    kind: "knowledge",
    icon: "knowledge",
    label: "知识参考",
    summary: source,
    meta: relevance !== null ? `relevance ${relevance.toFixed(2)} · ${source}` : source,
    markdown: [
      "# 知识参考",
      "",
      `- Source: ${source}`,
      relevance !== null ? `- Relevance: ${relevance.toFixed(2)}` : null,
      "",
      pattern,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    previewMode: "markdown",
    exportName: `knowledge-${slugify(source)}.md`,
    toolName,
    order,
  };
}

function buildFetchedReferenceArtifact(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  if (!output) return null;

  const content = normalizeString(output.content);
  const url = normalizeString(output.url);
  if (!content || !url) return null;

  const host = safeHost(url) || url;

  return {
    id: `artifact:knowledge:${url}`,
    kind: "knowledge",
    icon: "knowledge",
    label: "知识参考",
    summary: host,
    meta: `${formatCount(normalizeNumber(output.charCount) ?? content.length)} chars · ${host}`,
    markdown: content,
    previewMode: "markdown",
    exportName: `${slugify(host)}-reference.md`,
    toolName,
    order,
  };
}

function buildDocxExportArtifact(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
  workspaceId?: string,
): ReqArtifactItem | null {
  if (!output) return null;

  const outputPath = normalizeString(output.outputPath);
  const downloadName = normalizeString(output.downloadName) || "document.docx";
  const previewMarkdown = normalizeString(output.previewMarkdown);
  const sizeBytes = normalizeNumber(output.sizeBytes);

  if (!outputPath && !previewMarkdown) return null;

  const title = headingFromMarkdown(previewMarkdown) || downloadName;
  const downloadUrl = outputPath && workspaceId
    ? `/api/workspace/download?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(outputPath)}`
    : undefined;

  return {
    id: `artifact:docx:${toolCallId}`,
    kind: "document",
    icon: "docx",
    label: "DOCX 文档",
    summary: title,
    meta: sizeBytes !== null
      ? `${(sizeBytes / 1024).toFixed(1)} KB · ${downloadName}`
      : downloadName,
    markdown: previewMarkdown || `*文档已导出: ${downloadName}*`,
    previewMode: "markdown",
    exportName: downloadName,
    toolName,
    order,
    downloadUrl,
  };
}

function buildDocxParseArtifact(
  output: Record<string, unknown> | null,
  toolCallId: string,
  toolName: string,
  order: number,
): ReqArtifactItem | null {
  if (!output) return null;

  const targetPath = normalizeString(output.path);
  const headings = arrayOfStrings(output.headings);
  const textContent = normalizeString(output.textContent);
  const charCount = normalizeNumber(output.charCount);

  if (!targetPath || !textContent) return null;

  return {
    id: `artifact:knowledge:${toolCallId}`,
    kind: "knowledge",
    icon: "knowledge",
    label: "模板结构",
    summary: fileNameFromPath(targetPath),
    meta: charCount !== null
      ? `${formatCount(charCount)} chars · ${headings.length} headings`
      : `${headings.length} headings`,
    markdown: [
      `# 模板结构: ${fileNameFromPath(targetPath)}`,
      "",
      headings.length > 0 ? "## 章节标题" : "",
      ...headings.map((h) => `- ${h}`),
      "",
      "## 文本内容预览",
      "",
      textContent.slice(0, 3000),
    ].join("\n"),
    previewMode: "markdown",
    exportName: `${fileNameFromPath(targetPath).replace(/\.docx$/i, "")}-structure.md`,
    toolName,
    order,
  };
}

function isToolCallPart(value: unknown): value is ToolCallPartLike {
  return asRecord(value)?.type === "tool-call";
}

function getToolArgs(part: ToolCallPartLike): Record<string, unknown> | null {
  const args = asRecord(part.args);
  if (args) return args;

  const argsText = normalizeString(part.argsText);
  return argsText ? parseToolArgsText(argsText) : null;
}

function getStatusType(value: unknown) {
  const record = asRecord(value);
  return normalizeString(record?.type);
}

function isPendingStatus(statusType: string) {
  return [
    "running",
    "requires-action",
    "input-streaming",
    "input-available",
    "approval-requested",
    "approval-responded",
  ].includes(statusType);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function arrayOfRecords(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function headingFromMarkdown(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function firstMeaningfulLine(content: string) {
  const line = content
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.length > 0);

  return line ? truncateText(line, 96) : "";
}

function inferArtifactPreviewMode(targetPath: string): ReqArtifactPreviewMode {
  if (/\.(md|markdown|mdx)$/i.test(targetPath)) {
    return "markdown";
  }

  if (/\.(tsx?|jsx?|json|ya?ml|css|scss|less|html?|xml|sh|bash|zsh|py|rb|go|rs|java|kt|swift|sql|toml|ini|env)$/i.test(targetPath)) {
    return "code";
  }

  return "text";
}

function buildWritableArtifactLabel(targetPath: string, previewMode: ReqArtifactPreviewMode) {
  if (previewMode === "markdown" && targetPath.includes("requirements")) {
    return "需求文档";
  }

  return fileNameFromPath(targetPath);
}

function buildWritableArtifactSummary(
  targetPath: string,
  content: string,
  previewMode: ReqArtifactPreviewMode,
) {
  if (previewMode === "markdown") {
    return headingFromMarkdown(content) || targetPath;
  }

  if (previewMode === "code") {
    return targetPath;
  }

  return firstMeaningfulLine(content) || targetPath;
}

function buildWritableArtifactMeta({
  charCount,
  mode,
  path,
  sizeBytes,
}: {
  charCount: number;
  mode: string;
  path: string;
  sizeBytes: number | null;
}) {
  const sizeLabel = sizeBytes !== null ? formatBytes(sizeBytes) : `${formatCount(charCount)} chars`;
  return `${mode} · ${sizeLabel} · ${path}`;
}

function fileNameFromPath(targetPath: string) {
  const segments = targetPath.split("/");
  return segments[segments.length - 1] || targetPath;
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function slugify(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "reqagent";
}

function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function listOrFallback(items: string[], fallback: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

function hasOwn<T extends object, K extends PropertyKey>(
  value: T,
  key: K,
): value is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}
