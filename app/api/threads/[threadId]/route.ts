import { NextResponse } from "next/server";
import {
  getThreadWithMessages,
  renameThread,
  setThreadArchived,
} from "@/lib/db/store";

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
  const result = getThreadWithMessages(threadId);

  if (!result) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function PATCH(req: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown;
    isArchived?: unknown;
  };

  if (typeof body.isArchived === "boolean") {
    const thread = setThreadArchived(threadId, body.isArchived);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    return NextResponse.json({ thread });
  }

  const title = readNonEmptyString(body.title);
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const thread = renameThread(threadId, title);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ thread });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { threadId } = await context.params;
  const thread = setThreadArchived(threadId, true);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ thread });
}

