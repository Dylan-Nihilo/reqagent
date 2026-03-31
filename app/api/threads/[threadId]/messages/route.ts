import { NextResponse } from "next/server";
import {
  ensureThread,
  getThreadMessageEntries,
  getThreadWithMessages,
  upsertStoredMessageEntry,
} from "@/lib/db/store";
import { AI_SDK_V6_MESSAGE_FORMAT, isReqAgentMessageRole } from "@/lib/threads";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type RouteContext = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const thread = getThreadWithMessages(threadId);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({
    threadId,
    headId: thread.messages.at(-1)?.id ?? null,
    messages: getThreadMessageEntries(threadId).messages,
  });
}

export async function POST(req: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: unknown;
    item?: unknown;
  };

  ensureThread({
    threadId,
    workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : undefined,
  });

  if (!isRecord(body.item)) {
    return NextResponse.json({ error: "Missing message item" }, { status: 400 });
  }

  const content = body.item.content;
  const messageId = readNonEmptyString(body.item.id);
  if (
    !messageId ||
    !isRecord(content) ||
    typeof content.role !== "string" ||
    !Array.isArray(content.parts)
  ) {
    return NextResponse.json({ error: "Invalid message payload" }, { status: 400 });
  }

  if (!isReqAgentMessageRole(content.role)) {
    return NextResponse.json({ error: "Unsupported message role" }, { status: 400 });
  }

  upsertStoredMessageEntry(threadId, {
    id: messageId,
    parentId: typeof body.item.parentId === "string" ? body.item.parentId : null,
    format: typeof body.item.format === "string" ? body.item.format : AI_SDK_V6_MESSAGE_FORMAT,
    content: {
      role: content.role,
      parts: content.parts,
      ...(content.metadata !== undefined ? { metadata: content.metadata } : {}),
    },
    createdAt: typeof body.item.createdAt === "number" ? body.item.createdAt : Date.now(),
    updatedAt: typeof body.item.updatedAt === "number" ? body.item.updatedAt : Date.now(),
  });

  return NextResponse.json({ ok: true });
}
