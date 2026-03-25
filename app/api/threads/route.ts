import { NextRequest, NextResponse } from "next/server";
import { createThread, ensureWorkspace, listThreadsByWorkspace } from "@/lib/db/store";
import { DEFAULT_WORKSPACE_ID } from "@/lib/threads";

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function GET(req: NextRequest) {
  const workspaceId = readNonEmptyString(req.nextUrl.searchParams.get("workspaceId")) ?? DEFAULT_WORKSPACE_ID;
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") !== "0";

  ensureWorkspace(workspaceId);

  return NextResponse.json({
    workspaceId,
    threads: listThreadsByWorkspace(workspaceId, includeArchived),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: unknown;
    title?: unknown;
    id?: unknown;
  };

  const workspaceId = readNonEmptyString(body.workspaceId) ?? DEFAULT_WORKSPACE_ID;
  ensureWorkspace(workspaceId);

  const thread = createThread({
    id: readNonEmptyString(body.id),
    workspaceId,
    title: readNonEmptyString(body.title),
  });

  return NextResponse.json({ thread }, { status: 201 });
}

