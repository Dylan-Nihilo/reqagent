"use client";

import { useMemo } from "react";
import { useThread } from "@assistant-ui/react";
import { parseToolArgsText } from "@/lib/types";

export type ReqArtifactKind = "brief" | "stories" | "document" | "knowledge";

export type ReqArtifactItem = {
  id: string;
  kind: ReqArtifactKind;
  icon: string;
  label: string;
  summary: string;
  meta: string;
  markdown: string;
  exportName: string;
  toolName: string;
  order: number;
};

export type ReqPendingArtifact = {
  id: string;
  kind: ReqArtifactKind;
  icon: string;
  label: string;
  summary: string;
  toolName: string;
};

type ThreadMessageLike = {
  role?: unknown;
  content?: unknown;
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

export function useArtifacts(): ArtifactCollection {
  const messages = useThread((state) => state.messages);

  return useMemo(() => deriveArtifacts(messages as readonly ThreadMessageLike[]), [messages]);
}

function deriveArtifacts(messages: readonly ThreadMessageLike[]): ArtifactCollection {
  const itemsById = new Map<string, ReqArtifactItem>();
  let latestPending: ReqPendingArtifact | null = null;
  let order = 0;

  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.content)) continue;

    for (const part of message.content) {
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
}: {
  toolName: string;
  toolCallId: string;
  args: Record<string, unknown> | null;
  result: unknown;
  order: number;
}): ReqArtifactItem | null {
  const output = asRecord(result);

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
    case "search_knowledge":
      return buildKnowledgeArtifact(output, toolCallId, toolName, order);
    case "fetch_url":
      return buildFetchedReferenceArtifact(output, toolCallId, toolName, order);
    default:
      return null;
  }
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
        icon: "◈",
        label: "需求分析",
        summary: "正在提炼需求结构…",
        toolName,
      };
    case "generate_stories":
    case "generateStories":
      return {
        id: `pending:${toolCallId}`,
        kind: "stories",
        icon: "≡",
        label: "用户故事",
        summary: "正在拆解用户故事…",
        toolName,
      };
    case "generate_document":
    case "generateDoc":
      return {
        id: `pending:${toolCallId}`,
        kind: "document",
        icon: "⊡",
        label: "需求文档",
        summary: "正在生成文档…",
        toolName,
      };
    case "writeFile": {
      const targetPath = normalizeString(args?.path);
      if (!targetPath.toLowerCase().endsWith(".md")) return null;
      return {
        id: `pending:${toolCallId}`,
        kind: "document",
        icon: "⊡",
        label: targetPath.includes("requirements") ? "需求文档" : fileNameFromPath(targetPath),
        summary: `正在写入 ${targetPath}…`,
        toolName,
      };
    }
    case "search_knowledge":
    case "fetch_url":
      return {
        id: `pending:${toolCallId}`,
        kind: "knowledge",
        icon: "◎",
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
    icon: "◈",
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
    icon: "≡",
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
    icon: "⊡",
    label: "需求文档",
    summary: projectName,
    meta: `${formatCount(charCount)} chars · Markdown`,
    markdown: content,
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
  const content = normalizeString(args?.content);

  if (!targetPath.toLowerCase().endsWith(".md") || !content) return null;

  const title = targetPath.includes("requirements")
    ? "需求文档"
    : fileNameFromPath(targetPath);
  const charCount = normalizeNumber(output?.charCount) ?? content.length;

  return {
    id: `artifact:document:${targetPath}`,
    kind: "document",
    icon: "⊡",
    label: title,
    summary: headingFromMarkdown(content) || targetPath,
    meta: `${formatCount(charCount)} chars · ${targetPath}`,
    markdown: content,
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
  const content = normalizeString(output.content);
  if (!targetPath.toLowerCase().endsWith(".md") || !content) return null;

  return {
    id: `artifact:document:${targetPath}`,
    kind: "document",
    icon: "⊡",
    label: targetPath.includes("requirements") ? "需求文档" : fileNameFromPath(targetPath),
    summary: headingFromMarkdown(content) || targetPath,
    meta: `${formatCount(normalizeNumber(output.charCount) ?? content.length)} chars · ${targetPath}`,
    markdown: content,
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
    icon: "◎",
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
    icon: "◎",
    label: "知识参考",
    summary: host,
    meta: `${formatCount(normalizeNumber(output.charCount) ?? content.length)} chars · ${host}`,
    markdown: content,
    exportName: `${slugify(host)}-reference.md`,
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

function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function headingFromMarkdown(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "";
}

function fileNameFromPath(targetPath: string) {
  const segments = targetPath.split("/");
  return segments[segments.length - 1] || targetPath;
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
