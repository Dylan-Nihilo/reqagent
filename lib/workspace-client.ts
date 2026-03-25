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

// ---------------------------------------------------------------------------
// Skill selection (per-workspace)
// ---------------------------------------------------------------------------

function skillsStorageKey(workspaceId: string) {
  return `reqagent-skills-${workspaceId}`;
}

/** Get the list of active skill IDs for a workspace. */
export function getWorkspaceSkills(workspaceId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(skillsStorageKey(workspaceId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Set the list of active skill IDs for a workspace. */
export function setWorkspaceSkills(workspaceId: string, ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(skillsStorageKey(workspaceId), JSON.stringify(ids));
}

