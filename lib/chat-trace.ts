import path from "node:path";
import { promises as fs } from "node:fs";
import type { UIMessage } from "ai";
import { extractTextFromUIMessageParts } from "@/lib/threads";

type TraceContext = {
  threadId: string;
  threadKey: string;
  workspaceId: string;
  workspaceKey: string;
};

type TraceEvent = {
  ts: string;
  type: string;
  threadId: string;
  threadKey: string;
  workspaceId: string;
  workspaceKey: string;
  payload: Record<string, unknown>;
};

const TRACE_DIR = path.join(process.cwd(), ".reqagent", "traces");

function sanitizeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function summarizeText(value: string, maxLength = 240) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractArtifactPath(value: unknown) {
  const record = asRecord(value);
  if (!record) return undefined;

  const envelope = asRecord(record.reqagent);
  const artifact = envelope ? asRecord(envelope.artifact) : null;
  const envelopePath = artifact?.downloadPath ?? artifact?.path;
  if (typeof envelopePath === "string" && envelopePath.trim()) {
    return envelopePath.trim();
  }

  for (const key of ["outputPath", "path", "sourcePath"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function summarizeResult(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return {
      preview: summarizeText(String(value ?? "")),
    };
  }
  const envelope = asRecord(record.reqagent);

  return {
    artifactPath: extractArtifactPath(record),
    error: typeof record.error === "string" ? record.error : undefined,
    summary: typeof envelope?.summary === "string"
      ? envelope.summary
      : undefined,
    preview: summarizeText(JSON.stringify(record).slice(0, 320)),
  };
}

export function getLatestUserMessageText(messages: ReadonlyArray<UIMessage>) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return lastUserMessage ? extractTextFromUIMessageParts(lastUserMessage.parts) : "";
}

export async function appendChatTrace(
  context: TraceContext,
  type: string,
  payload: Record<string, unknown>,
) {
  await fs.mkdir(TRACE_DIR, { recursive: true });
  const filePath = path.join(TRACE_DIR, `${sanitizeFileName(context.threadId || context.threadKey)}.jsonl`);
  const event: TraceEvent = {
    ts: new Date().toISOString(),
    type,
    threadId: context.threadId,
    threadKey: context.threadKey,
    workspaceId: context.workspaceId,
    workspaceKey: context.workspaceKey,
    payload,
  };
  await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  return filePath;
}

export function buildStepTracePayload(input: {
  finishReason: string;
  text?: string;
  toolCalls: Array<{ toolName: string; input?: unknown }>;
  toolResults: Array<{ toolName?: unknown; output?: unknown; result?: unknown }>;
}) {
  return {
    finishReason: input.finishReason,
    textPreview: input.text ? summarizeText(input.text, 160) : undefined,
    toolCalls: input.toolCalls.map((toolCall) => ({
      toolName: toolCall.toolName,
      inputPreview: summarizeText(JSON.stringify(toolCall.input ?? {}), 200),
    })),
    toolResults: input.toolResults.map((toolResult) => ({
      toolName: String(toolResult.toolName ?? "unknown"),
      ...summarizeResult(toolResult.output ?? toolResult.result ?? toolResult),
    })),
  };
}
