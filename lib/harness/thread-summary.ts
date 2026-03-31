import { generateText, type UIMessage } from "ai";
import { z } from "zod";
import type {
  SummaryRecord,
  ThreadSummaryContent,
  WorkspaceSummaryContent,
} from "@/lib/db/summary";

const THREAD_SUMMARY_MESSAGE_THRESHOLD = 24;
const THREAD_SUMMARY_CHAR_THRESHOLD = 20_000;
const THREAD_RECENT_WINDOW = 8;
const SUMMARY_TRANSCRIPT_CHAR_LIMIT = 16_000;

const threadSummarySchema = z.object({
  goal: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  openQuestions: z.array(z.string()).optional(),
  recentTools: z.array(z.string()).optional(),
  artifactPaths: z.array(z.string()).optional(),
});

type SummarizeThreadInput = {
  model: Parameters<typeof generateText>[0]["model"];
  messages: ReadonlyArray<UIMessage>;
  currentSummary?: SummaryRecord<ThreadSummaryContent> | null;
};

type ToolPartLike = {
  type?: unknown;
  toolName?: unknown;
  result?: unknown;
};

function normalizeLines(values?: string[]) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function dedupeTail(values: string[], limit: number) {
  return [...new Set(values)].slice(-limit);
}

function extractTextParts(message: UIMessage) {
  return message.parts
    ?.filter((part): part is { type: "text"; text: string } => (part as { type?: string }).type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean) ?? [];
}

function getToolParts(message: UIMessage): ToolPartLike[] {
  if (!Array.isArray(message.parts)) return [];
  return message.parts
    .filter((part) => {
      const candidate = part as { type?: unknown };
      return candidate.type === "tool-call"
        || (typeof candidate.type === "string" && candidate.type.startsWith("tool-"));
    })
    .map((part) => part as ToolPartLike);
}

function safeToolArtifactPath(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const envelope = record.reqagent;
  if (envelope && typeof envelope === "object" && !Array.isArray(envelope)) {
    const artifact = (envelope as { artifact?: unknown }).artifact;
    if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
      const path = (artifact as { path?: unknown; downloadPath?: unknown }).downloadPath
        ?? (artifact as { path?: unknown }).path;
      if (typeof path === "string" && path.trim()) return path.trim();
    }
  }

  for (const key of ["outputPath", "path", "sourcePath"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

function extractToolNames(messages: ReadonlyArray<UIMessage>) {
  return dedupeTail(
    messages.flatMap((message) =>
      getToolParts(message)
        .map((part) => {
          if (typeof part.toolName === "string" && part.toolName.trim()) return part.toolName.trim();
          if (typeof part.type === "string" && part.type.startsWith("tool-")) return part.type.replace(/^tool-/, "");
          return "";
        })
        .filter(Boolean)),
    10,
  );
}

function extractArtifactPaths(messages: ReadonlyArray<UIMessage>) {
  return dedupeTail(
    messages.flatMap((message) =>
      getToolParts(message)
        .map((part) => safeToolArtifactPath(part.result))
        .filter((value): value is string => Boolean(value))),
    12,
  );
}

function estimateSerializedChars(messages: ReadonlyArray<UIMessage>) {
  return messages.reduce((sum, message) => {
    const partText = message.parts
      ?.map((part) => {
        if ((part as { type?: string }).type === "text") {
          return (part as { text?: string }).text ?? "";
        }
        if ((part as { type?: string }).type === "tool-call") {
          const toolPart = part as { toolName?: string; argsText?: string };
          return `${toolPart.toolName ?? "tool"} ${toolPart.argsText ?? ""}`;
        }
        return "";
      })
      .join("\n") ?? "";
    return sum + partText.length;
  }, 0);
}

function serializeMessagesForSummary(messages: ReadonlyArray<UIMessage>) {
  return messages.map((message, index) => {
    const text = extractTextParts(message).join("\n");
    const toolLines = getToolParts(message)
      .map((part) => {
        const artifactPath = safeToolArtifactPath(part.result);
        const toolName = typeof part.toolName === "string" && part.toolName.trim()
          ? part.toolName.trim()
          : typeof part.type === "string" && part.type.startsWith("tool-")
            ? part.type.replace(/^tool-/, "")
            : "tool";
        return artifactPath ? `[tool:${toolName}] ${artifactPath}` : `[tool:${toolName}]`;
      });
    const body = [text, ...toolLines].filter(Boolean).join("\n");
    return `${index + 1}. ${message.role}\n${body}`;
  }).join("\n\n").slice(-SUMMARY_TRANSCRIPT_CHAR_LIMIT);
}

function formatThreadSummary(summary?: ThreadSummaryContent | null) {
  if (!summary) return undefined;

  const lines = [
    summary.goal ? `- 目标: ${summary.goal}` : null,
    summary.decisions && summary.decisions.length > 0 ? `- 已决策: ${summary.decisions.join(" | ")}` : null,
    summary.openQuestions && summary.openQuestions.length > 0 ? `- 待确认: ${summary.openQuestions.join(" | ")}` : null,
    summary.recentTools && summary.recentTools.length > 0 ? `- 最近工具: ${summary.recentTools.join(", ")}` : null,
    summary.artifactPaths && summary.artifactPaths.length > 0 ? `- 产物路径: ${summary.artifactPaths.join(", ")}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

export function formatWorkspaceSummary(summary?: SummaryRecord<WorkspaceSummaryContent> | null) {
  if (!summary) return undefined;

  const recentArtifacts = summary.recentArtifacts
    ?.map((artifact) => `${artifact.path} (${artifact.label}${artifact.summary ? `: ${artifact.summary}` : ""})`)
    ?? [];
  const lines = [
    recentArtifacts.length > 0 ? `- 最近产物: ${recentArtifacts.join(" | ")}` : null,
    summary.trackedFiles && summary.trackedFiles.length > 0 ? `- 跟踪文件: ${summary.trackedFiles.join(", ")}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.length > 0 ? lines.join("\n") : undefined;
}

async function summarizeThreadHistory({
  model,
  messages,
  currentSummary,
}: SummarizeThreadInput): Promise<ThreadSummaryContent> {
  const transcript = serializeMessagesForSummary(messages);
  const firstUserMessage = messages.find((message) => message.role === "user");
  const fallback: ThreadSummaryContent = {
    goal: firstUserMessage ? extractTextParts(firstUserMessage)[0] : undefined,
    decisions: [],
    openQuestions: [],
    recentTools: extractToolNames(messages),
    artifactPaths: extractArtifactPaths(messages),
  };

  if (!transcript.trim()) {
    return fallback;
  }

  try {
    const { text } = await generateText({
      model,
      system: [
        "Summarize the older conversation history as JSON only.",
        "Return an object with optional fields: goal, decisions, openQuestions, recentTools, artifactPaths.",
        "Keep each array short and concrete. No markdown. No prose outside JSON.",
      ].join(" "),
      prompt: [
        currentSummary ? `Current summary: ${JSON.stringify(currentSummary)}` : "",
        "Conversation history:",
        transcript,
      ].filter(Boolean).join("\n\n"),
    });

    const match = text.match(/\{[\s\S]*\}/);
    const parsed = threadSummarySchema.safeParse(match ? JSON.parse(match[0]) : JSON.parse(text));
    if (parsed.success) {
      return {
        goal: parsed.data.goal || fallback.goal,
        decisions: dedupeTail(normalizeLines(parsed.data.decisions), 10),
        openQuestions: dedupeTail(normalizeLines(parsed.data.openQuestions), 10),
        recentTools: dedupeTail([
          ...normalizeLines(parsed.data.recentTools),
          ...(fallback.recentTools ?? []),
        ], 10),
        artifactPaths: dedupeTail([
          ...normalizeLines(parsed.data.artifactPaths),
          ...(fallback.artifactPaths ?? []),
        ], 12),
      };
    }
  } catch {
    // Fall through to heuristic fallback
  }

  return fallback;
}

export async function prepareThreadSummaryContext({
  model,
  messages,
  currentSummary,
}: SummarizeThreadInput) {
  const serializedChars = estimateSerializedChars(messages);
  const shouldCompact = messages.length > THREAD_SUMMARY_MESSAGE_THRESHOLD || serializedChars > THREAD_SUMMARY_CHAR_THRESHOLD;

  if (!shouldCompact) {
    return {
      modelMessages: messages,
      nextSummary: null as ThreadSummaryContent | null,
      threadSummaryText: undefined as string | undefined,
    };
  }

  const recentMessages = messages.slice(-THREAD_RECENT_WINDOW);
  const olderMessages = messages.slice(0, Math.max(0, messages.length - THREAD_RECENT_WINDOW));
  const nextSummary = await summarizeThreadHistory({
    model,
    messages: olderMessages,
    currentSummary,
  });

  return {
    modelMessages: recentMessages,
    nextSummary,
    threadSummaryText: formatThreadSummary(nextSummary),
  };
}

export function mergeWorkspaceSummary(
  currentSummary: SummaryRecord<WorkspaceSummaryContent> | null,
  messages: ReadonlyArray<UIMessage>,
): WorkspaceSummaryContent | null {
  const recentArtifacts = dedupeWorkspaceArtifacts([
    ...(currentSummary?.recentArtifacts ?? []),
    ...messages.flatMap((message) =>
      getToolParts(message)
        .map((part) => extractWorkspaceArtifactRecord(part.result))
        .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact))),
  ]).slice(-12);
  const trackedFiles = dedupeTail([
    ...(currentSummary?.trackedFiles ?? []),
    ...recentArtifacts.map((artifact) => artifact.path),
  ], 20);

  if (recentArtifacts.length === 0 && trackedFiles.length === 0) {
    return null;
  }

  return {
    recentArtifacts,
    trackedFiles,
  };
}

function dedupeWorkspaceArtifacts(records: Array<{ path: string; label: string; summary?: string }>) {
  const map = new Map<string, { path: string; label: string; summary?: string }>();
  for (const record of records) {
    map.set(record.path, record);
  }
  return [...map.values()];
}

function extractWorkspaceArtifactRecord(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const envelope = record.reqagent;
  const artifact = envelope && typeof envelope === "object" && !Array.isArray(envelope)
    ? (envelope as { artifact?: unknown }).artifact
    : undefined;
  if (artifact && typeof artifact === "object" && !Array.isArray(artifact)) {
    const candidate = artifact as { kind?: unknown; path?: unknown; downloadPath?: unknown; label?: unknown; summary?: unknown };
    const kind = typeof candidate.kind === "string" ? candidate.kind : "";
    if (!["document", "workspace"].includes(kind)) return null;

    const path = typeof candidate.downloadPath === "string" && candidate.downloadPath.trim()
      ? candidate.downloadPath.trim()
      : typeof candidate.path === "string" && candidate.path.trim()
        ? candidate.path.trim()
        : "";
    if (!path) return null;

    return {
      path,
      label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : path,
      summary: typeof candidate.summary === "string" && candidate.summary.trim() ? candidate.summary.trim() : undefined,
    };
  }

  const path = [record.outputPath, record.path, record.sourcePath]
    .find((value): value is string => typeof value === "string" && Boolean(value.trim()))
    ?.trim();
  if (!path) return null;

  return {
    path,
    label: typeof record.filename === "string" && record.filename.trim() ? record.filename.trim() : path,
    summary: typeof record.message === "string" && record.message.trim() ? record.message.trim() : undefined,
  };
}
