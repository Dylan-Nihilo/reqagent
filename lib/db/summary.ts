export type ThreadSummaryContent = {
  goal?: string;
  decisions?: string[];
  openQuestions?: string[];
  recentTools?: string[];
  artifactPaths?: string[];
};

export type WorkspaceSummaryContent = {
  recentArtifacts?: Array<{ path: string; label: string; summary?: string }>;
  trackedFiles?: string[];
};

export type SummaryRecord<T> = T & { updatedAt: number };

/** Safely parse a JSON string into the requested summary type. */
export function parseSummary<T>(value?: string): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    return null;
  }
  return null;
}

/** Serialize the summary object back to JSON. */
export function serializeSummary(summary: object): string {
  return JSON.stringify(summary);
}
