import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db } from "@/lib/db";
import { messages, threads, workspaces, type MessageRow } from "@/lib/db/schema";
import {
  parseSummary,
  serializeSummary,
  type SummaryRecord,
  type ThreadSummaryContent,
  type WorkspaceSummaryContent,
} from "@/lib/db/summary";
import {
  AI_SDK_V6_MESSAGE_FORMAT,
  DEFAULT_THREAD_TITLE,
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_TITLE,
  buildThreadTitleFromMessages,
  isReqAgentMessageRole,
  type ReqAgentStoredMessage,
  type ReqAgentStoredMessageEntry,
  type ReqAgentThreadRecord,
} from "@/lib/threads";

type PersistedMessageMetadataEnvelope = {
  uiMessageMetadata?: UIMessage["metadata"];
  history?: {
    parentId: string | null;
    format: string;
  };
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowMs() {
  return Date.now();
}

function serializeMessageMetadata(
  metadata: UIMessage["metadata"] | undefined,
  parentId: string | null,
  format = AI_SDK_V6_MESSAGE_FORMAT,
) {
  const payload: PersistedMessageMetadataEnvelope = {
    uiMessageMetadata: metadata,
    history: {
      parentId,
      format,
    },
  };

  return JSON.stringify(payload);
}

function deserializeMessageMetadata(value: string) {
  const parsed = parseJson<PersistedMessageMetadataEnvelope>(value, {});
  return {
    metadata: parsed.uiMessageMetadata,
    parentId: parsed.history?.parentId ?? null,
    format: parsed.history?.format ?? AI_SDK_V6_MESSAGE_FORMAT,
  };
}

function mapThreadRow(row: {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isArchived: boolean;
  messageCount?: number;
}): ReqAgentThreadRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isArchived: row.isArchived,
    messageCount: row.messageCount ?? 0,
  };
}

function mapMessageRow(row: MessageRow): ReqAgentStoredMessage {
  const { metadata, parentId, format } = deserializeMessageMetadata(row.metadataJson);
  return {
    id: row.id,
    threadId: row.threadId,
    role: isReqAgentMessageRole(row.role) ? row.role : "assistant",
    parts: parseJson<UIMessage["parts"]>(row.partsJson, []),
    metadata,
    parentId,
    format,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getWorkspaceIdOrDefault(workspaceId?: string | null) {
  const trimmed = workspaceId?.trim();
  return trimmed || DEFAULT_WORKSPACE_ID;
}

export function ensureWorkspace(workspaceId?: string | null, title = DEFAULT_WORKSPACE_TITLE) {
  const id = getWorkspaceIdOrDefault(workspaceId);
  const timestamp = nowMs();

  db.insert(workspaces)
    .values({
      id,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: workspaces.id,
      set: {
        title,
        updatedAt: timestamp,
      },
    })
    .run();

  return id;
}

export function getThread(threadId: string) {
  const row = db
    .select({
      id: threads.id,
      workspaceId: threads.workspaceId,
      title: threads.title,
      createdAt: threads.createdAt,
      updatedAt: threads.updatedAt,
      isArchived: threads.isArchived,
      messageCount: sql<number>`count(${messages.id})`,
    })
    .from(threads)
    .leftJoin(messages, eq(messages.threadId, threads.id))
    .where(eq(threads.id, threadId))
    .groupBy(threads.id)
    .get();

  return row ? mapThreadRow(row) : null;
}

export function listThreadsByWorkspace(workspaceId: string, includeArchived = true) {
  const rows = db
    .select({
      id: threads.id,
      workspaceId: threads.workspaceId,
      title: threads.title,
      createdAt: threads.createdAt,
      updatedAt: threads.updatedAt,
      isArchived: threads.isArchived,
      messageCount: sql<number>`count(${messages.id})`,
    })
    .from(threads)
    .leftJoin(messages, eq(messages.threadId, threads.id))
    .where(
      includeArchived
        ? eq(threads.workspaceId, workspaceId)
        : and(eq(threads.workspaceId, workspaceId), eq(threads.isArchived, false)),
    )
    .groupBy(threads.id)
    .orderBy(desc(threads.updatedAt))
    .all();

  return rows.map(mapThreadRow);
}

export function createThread(options: {
  id?: string;
  workspaceId?: string | null;
  title?: string;
}) {
  const timestamp = nowMs();
  const workspaceId = ensureWorkspace(options.workspaceId);
  const id = options.id ?? crypto.randomUUID();
  const title = options.title?.trim() || DEFAULT_THREAD_TITLE;

  db.insert(threads)
    .values({
      id,
      workspaceId,
      title,
      createdAt: timestamp,
      updatedAt: timestamp,
      isArchived: false,
    })
    .onConflictDoNothing()
    .run();

  return getThread(id)!;
}

export function ensureThread(options: {
  threadId: string;
  workspaceId?: string | null;
  title?: string;
}) {
  const existing = getThread(options.threadId);
  if (existing) return existing;
  return createThread({
    id: options.threadId,
    workspaceId: options.workspaceId,
    title: options.title,
  });
}

export function renameThread(threadId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return getThread(threadId);

  db.update(threads)
    .set({
      title: trimmed,
      updatedAt: nowMs(),
    })
    .where(eq(threads.id, threadId))
    .run();

  return getThread(threadId);
}

export function setThreadArchived(threadId: string, isArchived: boolean) {
  db.update(threads)
    .set({
      isArchived,
      updatedAt: nowMs(),
    })
    .where(eq(threads.id, threadId))
    .run();

  return getThread(threadId);
}

export function touchThread(threadId: string) {
  db.update(threads)
    .set({
      updatedAt: nowMs(),
    })
    .where(eq(threads.id, threadId))
    .run();
}

export function maybeAutoTitleThread(threadId: string, messagesToInspect: ReadonlyArray<Pick<UIMessage, "role" | "parts">>) {
  const current = getThread(threadId);
  if (!current) return null;

  if (current.title !== DEFAULT_THREAD_TITLE) {
    return current;
  }

  const title = buildThreadTitleFromMessages(messagesToInspect);
  return renameThread(threadId, title);
}

export function getThreadMessages(threadId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.createdAt)
    .all()
    .filter((row) => typeof row.id === "string" && row.id.trim().length > 0)
    .map(mapMessageRow);
}

export function getThreadMessageEntries(threadId: string): {
  headId: string | null;
  messages: ReqAgentStoredMessageEntry[];
} {
  const storedMessages = getThreadMessages(threadId);
  return {
    headId: storedMessages.at(-1)?.id ?? null,
    messages: storedMessages.map((message) => ({
      id: message.id,
      parentId: message.parentId,
      format: message.format,
      content: {
        role: message.role,
        parts: message.parts,
        ...(message.metadata !== undefined ? { metadata: message.metadata } : {}),
      },
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    })),
  };
}

export function getThreadWithMessages(threadId: string) {
  const thread = getThread(threadId);
  if (!thread) return null;

  return {
    thread,
    messages: getThreadMessages(threadId),
  };
}

export function upsertStoredMessageEntry(threadId: string, entry: ReqAgentStoredMessageEntry) {
  if (!entry.id.trim()) {
    return;
  }

  const timestamp = nowMs();
  const existing = db
    .select({
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.id, entry.id))
    .get();

  const role = entry.content.role;
  if (!isReqAgentMessageRole(role)) {
    throw new Error(`Unsupported message role: ${String(role)}`);
  }

  db.insert(messages)
    .values({
      id: entry.id,
      threadId,
      role,
      partsJson: JSON.stringify(entry.content.parts ?? []),
      metadataJson: serializeMessageMetadata(entry.content.metadata, entry.parentId, entry.format),
      createdAt: existing?.createdAt ?? entry.createdAt ?? timestamp,
      updatedAt: entry.updatedAt ?? timestamp,
    })
    .onConflictDoUpdate({
      target: messages.id,
      set: {
        threadId,
        role,
        partsJson: JSON.stringify(entry.content.parts ?? []),
        metadataJson: serializeMessageMetadata(entry.content.metadata, entry.parentId, entry.format),
        updatedAt: entry.updatedAt ?? timestamp,
      },
    })
    .run();

  touchThread(threadId);
}

export function syncThreadUiMessages(threadId: string, uiMessages: ReadonlyArray<UIMessage>) {
  const timestamp = nowMs();
  const existingRows = db
    .select({
      id: messages.id,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .all();

  const existingCreatedAt = new Map(existingRows.map((row) => [row.id, row.createdAt]));
  const incomingIds: string[] = [];

  uiMessages.forEach((message, index) => {
    if (!isReqAgentMessageRole(message.role)) return;
    if (!message.id.trim()) return;

    const parentId = incomingIds.at(-1) ?? null;
    incomingIds.push(message.id);

    db.insert(messages)
      .values({
        id: message.id,
        threadId,
        role: message.role,
        partsJson: JSON.stringify(message.parts ?? []),
        metadataJson: serializeMessageMetadata(message.metadata, parentId),
        createdAt: existingCreatedAt.get(message.id) ?? timestamp + index,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: messages.id,
        set: {
          threadId,
          role: message.role,
          partsJson: JSON.stringify(message.parts ?? []),
          metadataJson: serializeMessageMetadata(message.metadata, parentId),
          updatedAt: timestamp,
        },
      })
      .run();
  });

  if (incomingIds.length > 0) {
    db.delete(messages)
      .where(and(eq(messages.threadId, threadId), notInArray(messages.id, incomingIds)))
      .run();
  }

  touchThread(threadId);
  maybeAutoTitleThread(threadId, uiMessages);
}

export function getThreadWorkspaceId(threadId: string) {
  const row = db
    .select({
      workspaceId: threads.workspaceId,
    })
    .from(threads)
    .where(eq(threads.id, threadId))
    .get();

  return row?.workspaceId ?? null;
}

export function deleteMessagesByIds(threadId: string, ids: string[]) {
  if (ids.length === 0) return;
  db.delete(messages)
    .where(and(eq(messages.threadId, threadId), inArray(messages.id, ids)))
    .run();
}

function buildSummaryRecord<T extends ThreadSummaryContent | WorkspaceSummaryContent>(
  base: T | null,
  updatedAt: number,
): SummaryRecord<T> {
  return { ...(base ?? ({} as T)), updatedAt };
}

export function getThreadSummary(threadId: string): SummaryRecord<ThreadSummaryContent> | null {
  const row = db
    .select({ summaryJson: threads.summaryJson, summaryUpdatedAt: threads.summaryUpdatedAt })
    .from(threads)
    .where(eq(threads.id, threadId))
    .get();

  if (!row) return null;

  const parsed = parseSummary<ThreadSummaryContent>(row.summaryJson);
  return buildSummaryRecord(parsed, row.summaryUpdatedAt);
}

export function setThreadSummary(threadId: string, summary: ThreadSummaryContent) {
  const payload = serializeSummary(summary ?? {});
  db.update(threads)
    .set({ summaryJson: payload, summaryUpdatedAt: Date.now() })
    .where(eq(threads.id, threadId))
    .run();
}

export function getWorkspaceSummary(workspaceId: string): SummaryRecord<WorkspaceSummaryContent> | null {
  const row = db
    .select({ summaryJson: workspaces.summaryJson, summaryUpdatedAt: workspaces.summaryUpdatedAt })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get();

  if (!row) return null;

  const parsed = parseSummary<WorkspaceSummaryContent>(row.summaryJson);
  return buildSummaryRecord(parsed, row.summaryUpdatedAt);
}

export function setWorkspaceSummary(workspaceId: string, summary: WorkspaceSummaryContent) {
  const payload = serializeSummary(summary ?? {});
  db.update(workspaces)
    .set({ summaryJson: payload, summaryUpdatedAt: Date.now() })
    .where(eq(workspaces.id, workspaceId))
    .run();
}
