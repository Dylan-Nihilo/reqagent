import path from "node:path";
import { createHash } from "node:crypto";
import { DEFAULT_WORKSPACE_ID } from "@/lib/threads";

export const REQAGENT_ROOT_DIR = path.join(process.cwd(), ".reqagent");
export const WORKSPACES_ROOT_DIR = path.join(REQAGENT_ROOT_DIR, "workspaces");

export function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function summarizeMessagesForFallback(messages: unknown) {
  if (!Array.isArray(messages)) return "chat";

  return messages
    .flatMap((message) => {
      if (!message || typeof message !== "object") return [];
      const candidate = message as { role?: unknown; parts?: unknown; content?: unknown };
      const parts = Array.isArray(candidate.parts)
        ? candidate.parts
        : Array.isArray(candidate.content)
          ? candidate.content
          : [];

      return parts
        .map((part) => {
          if (!part || typeof part !== "object") return null;
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : null;
        })
        .filter((value): value is string => Boolean(value));
    })
    .join("\n")
    .slice(0, 4_000);
}

export function buildScopedKey(rawId: string) {
  const trimmed = rawId.trim();
  const safePrefix = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const digest = createHash("sha1").update(trimmed).digest("hex").slice(0, 12);
  return safePrefix ? `${safePrefix}-${digest}` : digest;
}

export function isPathInsideRoot(rootDir: string, candidatePath: string) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedCandidate = path.resolve(candidatePath);
  const rootPrefix = `${normalizedRoot}${path.sep}`;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(rootPrefix);
}

export function resolveRuntimeContext(input: {
  workspaceId?: unknown;
  threadId?: unknown;
  localThreadId?: unknown;
  id?: unknown;
  messageId?: unknown;
  messages?: unknown;
}) {
  const threadId =
    readNonEmptyString(input.threadId) ||
    readNonEmptyString(input.localThreadId) ||
    readNonEmptyString(input.id) ||
    readNonEmptyString(input.messageId) ||
    summarizeMessagesForFallback(input.messages) ||
    "chat";
  const threadKey = buildScopedKey(threadId);
  const workspaceId = readNonEmptyString(input.workspaceId) || DEFAULT_WORKSPACE_ID;
  const workspaceKey = buildScopedKey(workspaceId);
  const workspaceDir = path.join(WORKSPACES_ROOT_DIR, workspaceKey);

  return {
    threadId,
    threadKey,
    workspaceId,
    workspaceKey,
    workspaceDir,
  };
}

export type RuntimeContext = ReturnType<typeof resolveRuntimeContext>;

export async function ensureWorkspaceDirectory(workspaceDir: string) {
  const { promises: fs } = await import("node:fs");
  await fs.mkdir(path.join(workspaceDir, "docs"), { recursive: true });
  await fs.mkdir(path.join(workspaceDir, "src"), { recursive: true });
}

export function resolveWorkspacePath(workspaceDir: string, targetPath: string) {
  const normalized = targetPath.trim() || ".";
  const resolvedPath = path.resolve(workspaceDir, normalized);
  if (!isPathInsideRoot(workspaceDir, resolvedPath)) {
    return null;
  }

  return resolvedPath;
}

export function summarizeForDebug(value: unknown, maxLength = 220) {
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
  }

  try {
    const json = JSON.stringify(value);
    if (!json) return String(value);
    return json.length > maxLength ? `${json.slice(0, maxLength - 1)}…` : json;
  } catch {
    return String(value);
  }
}
