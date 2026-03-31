import type { UIMessage } from "ai";
import { extractTextFromMessageParts } from "@/lib/ui-message-utils";

export const DEFAULT_WORKSPACE_ID = "ws_reqagent_default";
export const DEFAULT_WORKSPACE_TITLE = "ReqAgent Workspace";
export const DEFAULT_THREAD_TITLE = "新对话";
export const THREAD_TITLE_MAX_LENGTH = 30;
export const AI_SDK_V6_MESSAGE_FORMAT = "ai-sdk/v6";

export type ReqAgentMessageRole = Extract<UIMessage["role"], "user" | "assistant" | "system">;

export type ReqAgentThreadRecord = {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  messageCount: number;
};

export type ReqAgentStoredMessage = {
  id: string;
  threadId: string;
  role: ReqAgentMessageRole;
  parts: UIMessage["parts"];
  metadata?: UIMessage["metadata"];
  parentId: string | null;
  format: string;
  createdAt: number;
  updatedAt: number;
};

export type ReqAgentStoredMessageEntry = {
  id: string;
  parentId: string | null;
  format: string;
  content: Omit<UIMessage, "id">;
  createdAt: number;
  updatedAt: number;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateThreadTitle(value: string, maxLength = THREAD_TITLE_MAX_LENGTH) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return DEFAULT_THREAD_TITLE;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

export function extractTextFromUIMessageParts(parts: UIMessage["parts"] | undefined) {
  return extractTextFromMessageParts(parts);
}

export function extractTextFromThreadMessages(
  messages: ReadonlyArray<{
    role: string;
    parts?: unknown;
    content?: unknown;
  }>,
) {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = extractTextFromMessageParts(message);
    if (text) return text;
  }

  for (const message of messages) {
    const text = extractTextFromMessageParts(message);
    if (text) return text;
  }

  return "";
}

export function buildThreadTitleFromMessages(
  messages: ReadonlyArray<Pick<UIMessage, "role" | "parts">>,
) {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = extractTextFromUIMessageParts(message.parts);
    if (text) return truncateThreadTitle(text);
  }

  for (const message of messages) {
    const text = extractTextFromUIMessageParts(message.parts);
    if (text) return truncateThreadTitle(text);
  }

  return DEFAULT_THREAD_TITLE;
}

export function isReqAgentMessageRole(value: unknown): value is ReqAgentMessageRole {
  return value === "user" || value === "assistant" || value === "system";
}
