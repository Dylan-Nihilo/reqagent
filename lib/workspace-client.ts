"use client";

import { DEFAULT_WORKSPACE_ID } from "@/lib/threads";

export const WORKSPACE_STORAGE_KEY = "reqagent.activeWorkspaceId";

export function getOrCreateWorkspaceId() {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_ID;

  const existing = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const workspaceId = `ws_${crypto.randomUUID()}`;
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  return workspaceId;
}

