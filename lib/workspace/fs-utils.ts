export type WorkspaceListEntry = {
  path: string;
  type: "file" | "dir";
  size?: number;
  mtime?: string;
};

export type SearchWorkspaceMatch = {
  path: string;
  line: number;
  match: string;
  context: string[];
  score: number;
};

export const ALWAYS_IGNORED_ENTRY_NAMES = new Set([".git", "node_modules", ".next", ".pnpm-store"]);

export function shouldSkipWorkspaceEntry(name: string, showHidden = false) {
  if (ALWAYS_IGNORED_ENTRY_NAMES.has(name)) return true;
  return !showHidden && name.startsWith(".");
}

export function buildGlobMatcher(glob?: string) {
  if (!glob?.trim()) return null;
  const normalizedPattern = glob.trim().replace(/\\/g, "/");
  const basePattern = normalizedPattern.includes("/")
    ? normalizedPattern
    : normalizedPattern.split("/").pop() ?? normalizedPattern;
  const regexSource = basePattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(/\u0000/g, ".*");
  const matcher = new RegExp(`^${regexSource}$`, "i");

  return {
    pattern: normalizedPattern,
    matches(candidatePath: string) {
      const normalizedCandidate = candidatePath.replace(/\\/g, "/");
      const target = normalizedPattern.includes("/")
        ? normalizedCandidate
        : normalizedCandidate.split("/").pop() ?? normalizedCandidate;
      return matcher.test(target);
    },
  };
}

export function compareWorkspaceEntries(
  left: WorkspaceListEntry,
  right: WorkspaceListEntry,
  sort: "name" | "size" | "mtime",
) {
  if (sort === "size") {
    const sizeDelta = (right.size ?? 0) - (left.size ?? 0);
    if (sizeDelta !== 0) return sizeDelta;
  } else if (sort === "mtime") {
    const timeDelta = (right.mtime ?? "").localeCompare(left.mtime ?? "");
    if (timeDelta !== 0) return timeDelta;
  }

  if (left.type !== right.type) {
    return left.type === "dir" ? -1 : 1;
  }

  return left.path.localeCompare(right.path, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function scoreSearchMatch(params: {
  line: string;
  query: string;
  regex: boolean;
  pattern?: RegExp | null;
}) {
  const normalizedLine = params.line.trim().toLowerCase();
  const normalizedQuery = params.query.trim().toLowerCase();

  if (!params.regex) {
    if (normalizedLine === normalizedQuery) return 0;
    if (normalizedLine.startsWith(normalizedQuery)) return 1;
    return 2;
  }

  if (!params.pattern) return 3;
  const firstIndex = params.line.search(params.pattern);
  if (firstIndex === 0) return 1;
  if (firstIndex > 0) return 2;
  return 3;
}
