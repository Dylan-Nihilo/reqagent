import path from "node:path";
import { createHash } from "node:crypto";
import {
  streamText,
  tool,
  jsonSchema,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { execa, ExecaError } from "execa";
import { getProviderInfo, reqAgentModel } from "@/lib/ai-provider";
import {
  ensureThread,
  getThreadWorkspaceId,
  syncThreadUiMessages,
} from "@/lib/db/store";
import { buildMcpRuntime } from "@/lib/mcp";
import { getAvailableToolsResult } from "@/lib/tool-registry";
import { DEFAULT_WORKSPACE_ID } from "@/lib/threads";
import type { ToolInvocationViewState } from "@/lib/types";

export const maxDuration = 60;

const REQAGENT_ROOT_DIR = path.join(process.cwd(), ".reqagent");
const WORKSPACES_ROOT_DIR = path.join(REQAGENT_ROOT_DIR, "workspaces");

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function summarizeMessagesForFallback(messages: unknown) {
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

function buildScopedKey(rawId: string) {
  const trimmed = rawId.trim();
  const safePrefix = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const digest = createHash("sha1").update(trimmed).digest("hex").slice(0, 12);
  return safePrefix ? `${safePrefix}-${digest}` : digest;
}

function isPathInsideRoot(rootDir: string, candidatePath: string) {
  const normalizedRoot = path.resolve(rootDir);
  const normalizedCandidate = path.resolve(candidatePath);
  const rootPrefix = `${normalizedRoot}${path.sep}`;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(rootPrefix);
}

function resolveRuntimeContext(input: {
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

async function ensureWorkspaceDirectory(workspaceDir: string) {
  const { promises: fs } = await import("node:fs");
  await fs.mkdir(path.join(workspaceDir, "docs"), { recursive: true });
  await fs.mkdir(path.join(workspaceDir, "src"), { recursive: true });
}

function resolveWorkspacePath(workspaceDir: string, targetPath: string) {
  const normalized = targetPath.trim() || ".";
  const resolvedPath = path.resolve(workspaceDir, normalized);
  if (!isPathInsideRoot(workspaceDir, resolvedPath)) {
    return null;
  }

  return resolvedPath;
}

function summarizeForDebug(value: unknown, maxLength = 220) {
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

type WorkspaceListEntry = {
  path: string;
  type: "file" | "dir";
  size?: number;
  mtime?: string;
};

type SearchWorkspaceMatch = {
  path: string;
  line: number;
  match: string;
  context: string[];
  score: number;
};

type ToolCategory = "workspace" | "shell" | "meta" | "mcp";

type MountedToolInfo = {
  name: string;
  category: ToolCategory;
  description: string;
};

const TOOL_DESCRIPTIONS = {
  fetch_url:
    "Fetch the content of a URL and return it as clean Markdown. Use this to read web pages, documentation, PRDs, or competitor sites shared by the user.",
  list_files:
    "List files in the workspace directory tree with metadata (type, size, mtime). Supports depth, sorting, hidden-file control, and summary stats.",
  search_workspace:
    "Full-text search across workspace files. Supports literal or regex matching, glob filtering, surrounding context, and relevance-ranked results.",
  readFile:
    "Read file contents from the workspace. Supports line-based pagination for text and base64 output for binary files.",
  writeFile:
    "Write content to a file in the workspace. Supports overwrite, append, and patch modes. Patch mode can replace one or all matches.",
  bash:
    "Execute a shell command in the workspace directory. Has full access to system commands (python3, node, git, curl, etc).",
  list_available_tools:
    "Return the list of currently available tools with category and description. Call when the user asks what you can do.",
} as const;

const ALWAYS_IGNORED_ENTRY_NAMES = new Set([".git", "node_modules", ".next", ".pnpm-store"]);

function shouldSkipWorkspaceEntry(name: string, showHidden = false) {
  if (ALWAYS_IGNORED_ENTRY_NAMES.has(name)) return true;
  return !showHidden && name.startsWith(".");
}

function buildGlobMatcher(glob?: string) {
  if (!glob?.trim()) return null;
  const normalizedPattern = glob.trim().replace(/\\/g, "/");
  const basePattern = normalizedPattern.includes("/") ? normalizedPattern : normalizedPattern.split("/").pop() ?? normalizedPattern;
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

function compareWorkspaceEntries(
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

function scoreSearchMatch(params: {
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

function categorizeTool(name: string): ToolCategory {
  if (["list_files", "search_workspace", "readFile", "writeFile", "fetch_url"].includes(name)) {
    return "workspace";
  }
  if (name === "bash") return "shell";
  if (name === "list_available_tools") return "meta";
  return "mcp";
}

function getToolDescription(name: string, tools: Record<string, unknown>) {
  if (name in TOOL_DESCRIPTIONS) {
    return TOOL_DESCRIPTIONS[name as keyof typeof TOOL_DESCRIPTIONS];
  }

  const candidate = tools[name] as
    | { description?: unknown; tool?: { description?: unknown } }
    | undefined;

  if (typeof candidate?.description === "string" && candidate.description.trim()) {
    return candidate.description;
  }

  if (typeof candidate?.tool?.description === "string" && candidate.tool.description.trim()) {
    return candidate.tool.description;
  }

  return "External MCP tool";
}

// ---------------------------------------------------------------------------
// Shell execution via execa — real shell, graceful timeout (SIGTERM → SIGKILL)
// ---------------------------------------------------------------------------

const SHELL_TIMEOUT_DEFAULT = 30_000;
const SHELL_OUTPUT_MAX = 128 * 1024; // 128KB per stream

function truncateOutput(value: string) {
  if (value.length <= SHELL_OUTPUT_MAX) return { text: value, truncated: false };
  return { text: value.slice(0, SHELL_OUTPUT_MAX) + "\n[...truncated]", truncated: true };
}

async function executeInWorkspace(
  command: string,
  cwd: string,
  timeout = SHELL_TIMEOUT_DEFAULT,
): Promise<{ stdout: string; stderr: string; exitCode: number; truncated?: boolean; timedOut?: boolean }> {
  try {
    const result = await execa({
      shell: "/bin/bash",
      cwd,
      timeout: Math.min(timeout, 120_000),
      reject: false,
    })`${command}`;

    const out = truncateOutput(result.stdout);
    const err = truncateOutput(result.stderr);
    return {
      stdout: out.text,
      stderr: err.text,
      exitCode: result.exitCode ?? 0,
      truncated: out.truncated || err.truncated || undefined,
      timedOut: result.timedOut || undefined,
    };
  } catch (error: unknown) {
    if (error instanceof ExecaError) {
      return {
        stdout: error.stdout ?? "",
        stderr: error.stderr || (error.timedOut ? "Process timed out" : error.shortMessage),
        exitCode: error.exitCode ?? 1,
        timedOut: error.timedOut || undefined,
      };
    }
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Custom structured tools (Layer 2 — high-frequency, stable, token-efficient)
// ---------------------------------------------------------------------------

const customTools = {
  fetch_url: tool({
    description: TOOL_DESCRIPTIONS.fetch_url,
    inputSchema: jsonSchema<{ url: string }>({
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"],
    }),
    execute: async ({ url }) => {
      // Jina Reader: converts any URL to clean Markdown, no API key needed.
      const jinaUrl = `https://r.jina.ai/${url}`;
      const res = await fetch(jinaUrl, {
        headers: { Accept: "text/markdown" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        return { error: `Fetch failed: ${res.status} ${res.statusText}`, url };
      }
      const text = await res.text();
      // Truncate to 32K chars to avoid flooding the context window.
      const truncated = text.length > 32_000;
      return {
        url,
        content: truncated ? text.slice(0, 32_000) + "\n\n[...truncated]" : text,
        charCount: text.length,
        truncated,
      };
    },
  }),

};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------


const SYSTEM_PROMPT = `你是 ReqAgent，一个 AI 助手。用中文回复，代码和路径保持英文。

你有以下工具：

结构化工具（优先使用）：
- list_files: 查看工作区目录结构（含 type/size/mtime）。首先使用这个了解项目布局。
- search_workspace: 在工作区中搜索文本，支持 glob、regex、上下文行和相关性排序。找代码、找文档用这个。
- readFile: 读取文件内容，支持 offset/limit 分段读取大文件，也支持 base64 返回原始文件内容。
- writeFile: 写入文件，支持 overwrite/append/patch 三种模式。patch 模式支持 replaceAll。
- fetch_url: 抓取任意网页并返回 Markdown。用户分享链接、查竞品、查文档时调用。
- list_available_tools: 返回实际挂载的工具目录。当用户问”你能做什么”时调用。

Shell 工具：
- bash: 在工作区目录下执行任意 shell 命令。支持 python3、node、git、curl 等系统命令。复杂操作或需要系统工具时使用。

动态外部工具：
- MCP 工具：如果系统已经接入外部 MCP server，会自动出现在工具列表中。

工作原则：
1. 了解项目 → 先 list_files，再针对性 readFile
2. 搜索内容 → 优先用 search_workspace（支持 glob 过滤）
3. 读写文件 → 用 readFile / writeFile（小修改用 patch 模式）
4. 系统命令 / 运行代码 → 用 bash（python3、node 等均可用）
5. 外部系统 → 优先用对应 MCP 工具
6. 总是先用结构化工具，bash 用于需要系统能力的场景`;

export async function POST(req: Request) {
  const body = await req.json();
  const uiMessages = Array.isArray((body as { messages?: unknown }).messages)
    ? ((body as { messages?: UIMessage[] }).messages ?? [])
    : [];
  const requestedThreadId = readNonEmptyString((body as { threadId?: unknown }).threadId);
  const persistedWorkspaceId = requestedThreadId
    ? getThreadWorkspaceId(requestedThreadId)
    : null;
  const providerInfo = getProviderInfo();
  const { threadId, threadKey, workspaceId, workspaceKey, workspaceDir } = resolveRuntimeContext({
    ...(body as {
      workspaceId?: unknown;
      threadId?: unknown;
      localThreadId?: unknown;
      id?: unknown;
      messageId?: unknown;
      messages?: unknown;
    }),
    workspaceId: readNonEmptyString((body as { workspaceId?: unknown }).workspaceId) ?? persistedWorkspaceId,
  });
  const persistedThread = ensureThread({
    threadId,
    workspaceId,
  });
  if (uiMessages.length > 0) {
    syncThreadUiMessages(persistedThread.id, uiMessages);
  }
  const runtimeContext = {
    threadId: persistedThread.id,
    threadKey,
    workspaceId: persistedThread.workspaceId,
    workspaceKey,
    workspaceDir,
  };
  await ensureWorkspaceDirectory(runtimeContext.workspaceDir);
  const toolInvocationStates: Record<string, ToolInvocationViewState> = {};
  const debugEvents: Array<{
    index: number;
    type: string;
    id?: string;
    toolCallId?: string;
    preliminary?: boolean;
  }> = [];
  const debugSteps: Array<{
    index: number;
    finishReason: string;
    textPreview?: string;
    toolCalls: Array<{ toolName: string; input?: unknown }>;
    toolResults: Array<{ toolName: string; outputPreview: string }>;
  }> = [];
  let debugEventIndex = 0;
  let debugStepIndex = 0;

  const mcpRuntime = await buildMcpRuntime({
    workspaceId: runtimeContext.workspaceId,
    workspaceKey: runtimeContext.workspaceKey,
    workspaceDir: runtimeContext.workspaceDir,
    threadId: runtimeContext.threadId,
    threadKey: runtimeContext.threadKey,
  });
  const availableToolsResult = getAvailableToolsResult(mcpRuntime.registryItems);

  const workspaceTools = {
    list_files: tool({
      description: TOOL_DESCRIPTIONS.list_files,
      inputSchema: jsonSchema<{
        dir?: string;
        maxDepth?: number;
        limit?: number;
        sort?: "name" | "size" | "mtime";
        showHidden?: boolean;
      }>({
        type: "object",
        properties: {
          dir: { type: "string", description: "Subdirectory to list (default: workspace root)" },
          maxDepth: { type: "number", description: "Max directory depth (default: 3)" },
          limit: { type: "number", description: "Max entries to return (default: 200)" },
          sort: {
            type: "string",
            enum: ["name", "size", "mtime"],
            description: "Sort entries by name, size, or mtime (default: name)",
          },
          showHidden: {
            type: "boolean",
            description: "Include hidden dotfiles except always-ignored system folders (default: false)",
          },
        },
      }),
      execute: async ({ dir, maxDepth, limit, sort, showHidden }) => {
        const { promises: fs } = await import("node:fs");
        const targetDir = resolveWorkspacePath(runtimeContext.workspaceDir, dir || ".");
        if (!targetDir) {
          return { error: "Access denied: path outside workspace", root: dir, entries: [], count: 0 };
        }

        let targetStat;
        try {
          targetStat = await fs.stat(targetDir);
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to access target directory",
            root: dir || ".",
            entries: [],
            count: 0,
          };
        }

        if (!targetStat.isDirectory()) {
          return {
            error: "Target path is not a directory",
            root: dir || ".",
            entries: [],
            count: 0,
          };
        }

        const requestedLimit = Math.min(Math.max(limit ?? 200, 1), 500);
        const maxDiscoveredEntries = Math.max(requestedLimit, 2_000);
        const effectiveSort = sort ?? "name";
        const includeHidden = Boolean(showHidden);
        const entries: WorkspaceListEntry[] = [];
        let discoveredTruncated = false;

        async function walk(currentDir: string, depth: number) {
          if (depth > (maxDepth ?? 3) || discoveredTruncated) return;
          const dirEntries = (await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []))
            .filter((entry) => !shouldSkipWorkspaceEntry(entry.name, includeHidden))
            .sort((left, right) =>
              left.name.localeCompare(right.name, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            );

          for (const entry of dirEntries) {
            if (entries.length >= maxDiscoveredEntries) {
              discoveredTruncated = true;
              break;
            }
            const abs = path.join(currentDir, entry.name);
            const rel = path.relative(runtimeContext.workspaceDir, abs);
            let stat;

            try {
              stat = await fs.stat(abs);
            } catch {
              stat = undefined;
            }

            if (entry.isDirectory()) {
              entries.push({
                path: `${rel.replace(/\\/g, "/")}/`,
                type: "dir",
                mtime: stat ? new Date(stat.mtimeMs).toISOString() : undefined,
              });
              await walk(abs, depth + 1);
            } else {
              entries.push({
                path: rel.replace(/\\/g, "/"),
                type: "file",
                size: stat?.size,
                mtime: stat ? new Date(stat.mtimeMs).toISOString() : undefined,
              });
            }
          }
        }

        await walk(targetDir, 0);
        const sortedEntries = [...entries].sort((left, right) =>
          compareWorkspaceEntries(left, right, effectiveSort),
        );
        const limitedEntries = sortedEntries.slice(0, requestedLimit);
        const fileCount = sortedEntries.filter((entry) => entry.type === "file").length;
        const dirCount = sortedEntries.filter((entry) => entry.type === "dir").length;
        const totalSize = sortedEntries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);

        return {
          root: dir || ".",
          sort: effectiveSort,
          showHidden: includeHidden,
          entries: limitedEntries,
          count: limitedEntries.length,
          totalEntries: sortedEntries.length,
          truncated: discoveredTruncated || sortedEntries.length > requestedLimit,
          fileCount,
          dirCount,
          totalSize,
        };
      },
    }),

    search_workspace: tool({
      description: TOOL_DESCRIPTIONS.search_workspace,
      inputSchema: jsonSchema<{
        query: string;
        limit?: number;
        contextLines?: number;
        glob?: string;
        regex?: boolean;
        maxFileSize?: number;
      }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for (case-insensitive)" },
          limit: { type: "number", description: "Max results (default: 12)" },
          contextLines: { type: "number", description: "Lines of context before/after each match (default: 1)" },
          glob: { type: "string", description: "File extension filter, e.g. '*.md' or '*.py'" },
          regex: { type: "boolean", description: "Treat query as a regex pattern (default: false)" },
          maxFileSize: {
            type: "number",
            description: "Max file size in bytes to search (default: 524288)",
          },
        },
        required: ["query"],
      }),
      execute: async ({ query, limit, contextLines, glob, regex, maxFileSize }) => {
        const { promises: fs } = await import("node:fs");
        const maxResults = Math.min(limit ?? 12, 30);
        const ctx = Math.min(contextLines ?? 1, 5);
        const maxBytes = Math.min(Math.max(maxFileSize ?? 512 * 1024, 1), 5 * 1024 * 1024);
        const lowerQuery = query.toLowerCase();
        const globMatcher = buildGlobMatcher(glob);
        const matches: SearchWorkspaceMatch[] = [];
        let totalMatches = 0;
        let filesSearched = 0;
        let filesMatched = 0;
        let pattern: RegExp | null = null;

        if (regex) {
          try {
            pattern = new RegExp(query, "i");
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : "Invalid regex pattern",
              query,
              regex: true,
            };
          }
        }

        async function search(dir: string) {
          const entries = (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
            .filter((entry) => !shouldSkipWorkspaceEntry(entry.name))
            .sort((left, right) =>
              left.name.localeCompare(right.name, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
            );

          for (const entry of entries) {
            const abs = path.join(dir, entry.name);
            if (!abs.startsWith(runtimeContext.workspaceDir)) continue;
            if (entry.isDirectory()) {
              await search(abs);
            } else {
              const relPath = path.relative(runtimeContext.workspaceDir, abs).replace(/\\/g, "/");
              if (globMatcher && !globMatcher.matches(relPath)) continue;

              try {
                const stat = await fs.stat(abs);
                if (stat.size > maxBytes) continue;
                filesSearched++;
                const content = await fs.readFile(abs, "utf8");
                const lines = content.split("\n");
                let fileMatchCount = 0;

                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i] ?? "";
                  const isMatch = pattern
                    ? pattern.test(line)
                    : line.toLowerCase().includes(lowerQuery);

                  if (isMatch) {
                    totalMatches++;
                    fileMatchCount++;
                    const start = Math.max(0, i - ctx);
                    const end = Math.min(lines.length - 1, i + ctx);
                    matches.push({
                      path: relPath,
                      line: i + 1,
                      match: line.trim().slice(0, 200),
                      context: lines.slice(start, end + 1).map((contextLine, idx) => {
                        const n = start + idx + 1;
                        return `${n === i + 1 ? ">" : " "}${String(n).padStart(4)}│ ${contextLine}`;
                      }),
                      score: scoreSearchMatch({
                        line,
                        query,
                        regex: Boolean(regex),
                        pattern,
                      }),
                    });
                  }
                }

                if (fileMatchCount > 0) {
                  filesMatched++;
                }
              } catch {
                // Skip unreadable files
              }
            }
          }
        }

        await search(runtimeContext.workspaceDir);
        const rankedMatches = matches
          .sort((left, right) => {
            if (left.score !== right.score) return left.score - right.score;
            const pathDelta = left.path.localeCompare(right.path, undefined, {
              numeric: true,
              sensitivity: "base",
            });
            if (pathDelta !== 0) return pathDelta;
            return left.line - right.line;
          })
          .slice(0, maxResults)
          .map(({ score: _score, ...match }) => match);

        return {
          query,
          regex: Boolean(regex),
          glob: globMatcher?.pattern,
          found: rankedMatches.length,
          totalMatches,
          filesSearched,
          filesMatched,
          maxFileSize: maxBytes,
          matches: rankedMatches,
          truncated: totalMatches > rankedMatches.length,
        };
      },
    }),

    readFile: tool({
      description: TOOL_DESCRIPTIONS.readFile,
      inputSchema: jsonSchema<{
        path: string;
        offset?: number;
        limit?: number;
        encoding?: "utf8" | "base64";
      }>({
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to the file" },
          offset: { type: "number", description: "Start from this line number (1-based, default: 1)" },
          limit: { type: "number", description: "Max lines to return (default: all, cap: 2000)" },
          encoding: {
            type: "string",
            enum: ["utf8", "base64"],
            description: "Return text as utf8 or raw file bytes as base64 (default: utf8)",
          },
        },
        required: ["path"],
      }),
      execute: async ({ path: targetPath, offset, limit, encoding }) => {
        const { promises: fs } = await import("node:fs");
        const resolved = resolveWorkspacePath(runtimeContext.workspaceDir, targetPath);
        if (!resolved) {
          return { error: "Access denied: path outside workspace", path: targetPath };
        }

        try {
          const stat = await fs.stat(resolved);
          const effectiveEncoding = encoding === "base64" ? "base64" : "utf8";

          if (effectiveEncoding === "base64") {
            const buffer = await fs.readFile(resolved);
            return {
              path: path.relative(runtimeContext.workspaceDir, resolved).replace(/\\/g, "/"),
              content: buffer.toString("base64"),
              encoding: "base64",
              sizeBytes: stat.size,
            };
          }

          const content = await fs.readFile(resolved, "utf8");
          const lines = content.split("\n");
          const totalLines = lines.length;
          const startLine = Math.max(1, offset ?? 1);
          const maxLines = Math.min(limit ?? totalLines, 2000);
          const sliced = lines.slice(startLine - 1, startLine - 1 + maxLines);

          return {
            path: path.relative(runtimeContext.workspaceDir, resolved).replace(/\\/g, "/"),
            content: sliced.join("\n"),
            encoding: "utf8",
            totalLines,
            fromLine: startLine,
            toLine: startLine + sliced.length - 1,
            truncated: startLine > 1 || sliced.length < totalLines,
            sizeBytes: stat.size,
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "Failed to read file",
            path: targetPath,
          };
        }
      },
    }),

    writeFile: {
      ...tool({
        description: TOOL_DESCRIPTIONS.writeFile,
        inputSchema: jsonSchema<{
          path: string;
          content: string;
          mode?: string;
          match?: string;
          replaceAll?: boolean;
        }>({
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path to the file" },
            content: { type: "string", description: "Content to write, or replacement text in patch mode" },
            mode: { type: "string", enum: ["overwrite", "append", "patch"], description: "Write mode (default: overwrite)" },
            match: { type: "string", description: "Text to find and replace (required for patch mode)" },
            replaceAll: {
              type: "boolean",
              description: "Replace all matches in patch mode instead of only the first one (default: false)",
            },
          },
          required: ["path", "content"],
        }),
        execute: async ({ path: targetPath, content, mode, match, replaceAll }) => {
          const { promises: fs } = await import("node:fs");
          const resolved = resolveWorkspacePath(runtimeContext.workspaceDir, targetPath);
          if (!resolved) {
            return { error: "Access denied: path outside workspace", path: targetPath };
          }

          await fs.mkdir(path.dirname(resolved), { recursive: true });
          const effectiveMode = mode ?? "overwrite";
          let replacements: number | undefined;

          if (effectiveMode === "patch") {
            if (!match) return { error: "patch mode requires the `match` parameter", path: targetPath };
            let existing: string;
            try {
              existing = await fs.readFile(resolved, "utf8");
            } catch {
              return { error: "File does not exist — cannot patch", path: targetPath };
            }
            const occurrenceCount = existing.split(match).length - 1;
            if (occurrenceCount === 0) {
              return { error: "match text not found in file", path: targetPath, matchPreview: match.slice(0, 120) };
            }
            const nextContent = replaceAll
              ? existing.split(match).join(content)
              : existing.replace(match, content);
            replacements = replaceAll ? occurrenceCount : 1;
            await fs.writeFile(resolved, nextContent, "utf8");
          } else if (effectiveMode === "append") {
            await fs.appendFile(resolved, content, "utf8");
          } else {
            await fs.writeFile(resolved, content, "utf8");
          }

          const stat = await fs.stat(resolved);
          return {
            success: true,
            path: path.relative(runtimeContext.workspaceDir, resolved).replace(/\\/g, "/"),
            mode: effectiveMode,
            replaceAll: effectiveMode === "patch" ? Boolean(replaceAll) : undefined,
            replacements,
            sizeBytes: stat.size,
          };
        },
      }),
      needsApproval: true,
    },

    fetch_url: customTools.fetch_url,
  };

  const allTools = {
    ...workspaceTools,
    ...mcpRuntime.tools,
    bash: {
      ...tool({
        description: TOOL_DESCRIPTIONS.bash,
        inputSchema: jsonSchema<{ command: string; timeout?: number }>({
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to execute" },
            timeout: { type: "number", description: "Timeout in ms (default: 30000, max: 120000)" },
          },
          required: ["command"],
        }),
        execute: async ({ command, timeout }) => {
          return executeInWorkspace(command, runtimeContext.workspaceDir, timeout);
        },
      }),
      needsApproval: true,
    },
    list_available_tools: tool({
      description: TOOL_DESCRIPTIONS.list_available_tools,
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const mountedNames = [
          ...Object.keys(workspaceTools),
          ...Object.keys(mcpRuntime.tools),
          "bash",
          "list_available_tools",
        ];
        const toolSources: Record<string, unknown> = {
          ...workspaceTools,
          ...mcpRuntime.tools,
        };
        const tools: MountedToolInfo[] = mountedNames.map((name) => ({
          name,
          category: categorizeTool(name),
          description: getToolDescription(name, toolSources),
        }));

        return {
          ...availableToolsResult,
          mountedToolNames: mountedNames,
          total: tools.length,
          tools,
          categories: {
            workspace: tools.filter((toolEntry) => toolEntry.category === "workspace"),
            shell: tools.filter((toolEntry) => toolEntry.category === "shell"),
            meta: tools.filter((toolEntry) => toolEntry.category === "meta"),
            mcp: tools.filter((toolEntry) => toolEntry.category === "mcp"),
          },
          summary: `当前共 ${tools.length} 个可用工具（workspace ${tools.filter((toolEntry) => toolEntry.category === "workspace").length} / mcp ${tools.filter((toolEntry) => toolEntry.category === "mcp").length}）`,
        };
      },
    }),
  };

  let result;
  try {
  result = streamText({
    model: reqAgentModel,
    system:
      `${SYSTEM_PROMPT}\n\n` +
      `当前会话 thread_id: ${runtimeContext.threadId}\n` +
      `当前会话 thread_key: ${runtimeContext.threadKey}\n` +
      `当前工作区目录: ${runtimeContext.workspaceDir}\n` +
      `${mcpRuntime.promptSection}\n` +
      "需求文档默认写入 docs/requirements.md。\n" +
      "不要使用 bash 创建、覆盖或移动文档文件；文件读写一律使用 readFile / writeFile 或已接入的文件系统工具。\n" +
      "所有文件操作都以当前项目工作区为根目录，不要依赖其他项目或其他会话留下的文件。",
    messages: await convertToModelMessages(uiMessages),
    tools: allTools,
    stopWhen: stepCountIs(8),
    providerOptions: {
      openai: { store: providerInfo.wireApi === "responses" ? true : undefined },
    },
    onFinish: async () => {
      await mcpRuntime.cleanup();
    },
    onStepFinish: ({ toolCalls, toolResults, text, finishReason }) => {
      debugSteps.push({
        index: ++debugStepIndex,
        finishReason,
        textPreview: text ? summarizeForDebug(text, 320) : undefined,
        toolCalls: toolCalls.map((toolCall) => ({
          toolName: toolCall.toolName,
          input: toolCall.input,
        })),
        toolResults: toolResults.map((toolResult) => {
          const candidate = toolResult as Record<string, unknown>;
          return {
            toolName: String(candidate.toolName ?? "unknown"),
            outputPreview: summarizeForDebug(candidate.output ?? candidate.result ?? candidate, 240),
          };
        }),
      });
      if (debugSteps.length > 12) debugSteps.shift();

      if (toolCalls.length > 0) {
        console.log("[ReqAgent step] tools:", toolCalls.map((t) => `${t.toolName}(${JSON.stringify(t.input).slice(0, 120)})`));
      }
      if (text) console.log(`[ReqAgent step] text: ${text.slice(0, 80)}...`);
      console.log(`[ReqAgent step] finish: ${finishReason}, toolResults: ${toolResults.length}`);
    },
  });
  } catch (error) {
    await mcpRuntime.cleanup();
    throw error;
  }

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    onFinish: async ({ messages: finalMessages }) => {
      syncThreadUiMessages(runtimeContext.threadId, finalMessages);
    },
    sendReasoning: true,
    messageMetadata: ({ part }) => {
      const chunk = part as {
        id?: string;
        preliminary?: boolean;
        toolCall?: { toolCallId?: string };
        toolCallId?: string;
        type: string;
      };
      const event = {
        index: ++debugEventIndex,
        type: part.type,
        id: chunk.id,
        toolCallId: chunk.toolCallId ?? chunk.toolCall?.toolCallId,
        preliminary: chunk.preliminary,
      };
      debugEvents.push(event);
      if (debugEvents.length > 48) debugEvents.shift();

      // Wrap in `custom` so @assistant-ui/react-ai-sdk preserves it in useMessage().metadata.custom
      const basePayload = {
        activeRole: null,
        debug: {
          threadId: runtimeContext.threadId,
          threadKey: runtimeContext.threadKey,
          workspaceId: runtimeContext.workspaceId,
          workspaceKey: runtimeContext.workspaceKey,
          workspaceDir: runtimeContext.workspaceDir,
          mcpServers: mcpRuntime.servers,
          lastEvent: event,
          events: [...debugEvents],
          steps: [...debugSteps],
        },
        model: providerInfo.model,
        publicThinking: "",
        toolInvocationStates: { ...toolInvocationStates },
        wireApi: providerInfo.wireApi,
      };

      const withToolState = (toolCallId: string, state: ToolInvocationViewState, phaseLabel: string) => {
        toolInvocationStates[toolCallId] = state;
        return {
          custom: {
            ...basePayload,
            agentActivity: "tool_calling" as const,
            phaseLabel,
            toolInvocationStates: { ...toolInvocationStates },
          },
        };
      };

      switch (chunk.type) {
        case "tool-input-start":
          return withToolState(chunk.toolCallId ?? chunk.id ?? "unknown", "drafting_input", "组装参数");
        case "tool-input-available":
          return withToolState(chunk.toolCallId ?? chunk.id ?? "unknown", "input_ready", "工具调用");
        case "tool-approval-request":
          return withToolState(chunk.toolCall?.toolCallId ?? chunk.toolCallId ?? "unknown", "awaiting_approval", "等待批准");
        case "tool-output-available":
          return withToolState(chunk.toolCallId ?? "unknown", chunk.preliminary ? "streaming_output" : "succeeded", chunk.preliminary ? "输出流" : "工具完成");
        case "tool-error":
          return withToolState(chunk.toolCallId ?? "unknown", "failed", "工具失败");
        case "tool-output-denied":
          return withToolState(chunk.toolCallId ?? "unknown", "denied", "已拒绝");
        case "text-start":
        case "text-delta":
          return { custom: { ...basePayload, agentActivity: "responding", phaseLabel: "生成回复" } };
        case "reasoning-start":
        case "reasoning-delta":
          return { custom: { ...basePayload, agentActivity: "thinking", phaseLabel: "推理" } };
        default:
          return { custom: { ...basePayload, agentActivity: "responding", phaseLabel: "对话" } };
      }
    },
  });
}
