import path from "node:path";
import { promises as fs } from "node:fs";
import { tool, jsonSchema } from "ai";
import { getAvailableToolsResult } from "@/lib/tool-registry";
import type { ReqAgentMcpRuntime } from "@/lib/mcp";
import type { RuntimeContext } from "@/lib/workspace/context";
import type { MountedToolInfo } from "@/lib/workspace/tool-catalog";
import { resolveWorkspacePath } from "@/lib/workspace/context";
import {
  buildGlobMatcher,
  compareWorkspaceEntries,
  scoreSearchMatch,
  shouldSkipWorkspaceEntry,
  type SearchWorkspaceMatch,
  type WorkspaceListEntry,
} from "@/lib/workspace/fs-utils";
import {
  categorizeTool,
  getToolDescription,
  TOOL_DESCRIPTIONS,
} from "@/lib/workspace/tool-catalog";
import { executeInWorkspace, fetchUrlTool } from "@/lib/workspace/shell";

const WORKSPACE_TOOL_NAMES = [
  "fetch_url",
  "list_files",
  "search_workspace",
  "readFile",
  "writeFile",
  "bash",
  "list_available_tools",
] as const;

export function buildWorkspaceTools(
  runtimeContext: RuntimeContext,
  mcpRuntime: ReqAgentMcpRuntime,
) {
  const availableToolsResult = getAvailableToolsResult(mcpRuntime.registryItems);

  return {
    fetch_url: fetchUrlTool,

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
          .map((match) => ({
            path: match.path,
            line: match.line,
            match: match.match,
            context: match.context,
          }));

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
          ...WORKSPACE_TOOL_NAMES,
          ...Object.keys(mcpRuntime.tools),
        ];
        const toolSources: Record<string, unknown> = {
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
}
