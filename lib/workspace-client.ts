"use client";

import { DEFAULT_WORKSPACE_ID } from "@/lib/threads";

export const WORKSPACE_STORAGE_KEY = "reqagent.activeWorkspaceId";

export function getOrCreateWorkspaceId() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, DEFAULT_WORKSPACE_ID);
  }
  return DEFAULT_WORKSPACE_ID;
}
