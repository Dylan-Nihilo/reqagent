import path from "node:path";
import { createHash } from "node:crypto";
import {
  streamText,
  tool,
  jsonSchema,
  stepCountIs,
  convertToModelMessages,
} from "ai";
import { createBashTool } from "bash-tool";
import { getProviderInfo, reqAgentModel } from "@/lib/ai-provider";
import type { ToolInvocationViewState } from "@/lib/types";

export const maxDuration = 60;

const REQAGENT_ROOT_DIR = path.join(process.cwd(), ".reqagent");
const THREADS_ROOT_DIR = path.join(REQAGENT_ROOT_DIR, "threads");

function summarizeMessagesForFallback(messages: unknown) {
  if (!Array.isArray(messages)) return "thread";

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

function buildThreadKey(rawId: string) {
  const trimmed = rawId.trim();
  const safePrefix = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const digest = createHash("sha1").update(trimmed).digest("hex").slice(0, 12);
  return safePrefix ? `${safePrefix}-${digest}` : digest;
}

function resolveThreadWorkspace(input: { id?: unknown; messageId?: unknown; messages?: unknown }) {
  const rawId =
    (typeof input.id === "string" && input.id.trim()) ||
    (typeof input.messageId === "string" && input.messageId.trim()) ||
    summarizeMessagesForFallback(input.messages) ||
    "thread";
  const threadKey = buildThreadKey(rawId);
  const workspaceDir = path.join(THREADS_ROOT_DIR, threadKey, "workspace");

  return {
    threadId: rawId,
    threadKey,
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
  const workspacePrefix = `${workspaceDir}${path.sep}`;

  if (resolvedPath !== workspaceDir && !resolvedPath.startsWith(workspacePrefix)) {
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

// ---------------------------------------------------------------------------
// Custom structured tools (Layer 2 — high-frequency, stable, token-efficient)
// ---------------------------------------------------------------------------

const customTools = {
  fetch_url: tool({
    description:
      "Fetch the content of a URL and return it as clean Markdown. " +
      "Use this to read web pages, documentation, PRDs, or competitor sites shared by the user.",
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
- list_files: 查看工作区目录结构。首先使用这个了解项目布局。
- search_workspace: 在工作区中搜索文本。找代码、找文档用这个。
- fetch_url: 抓取任意网页并返回 Markdown。用户分享链接、查竞品、查文档时调用。
- list_available_tools: 返回结构化工具目录。当用户询问“你有哪些工具”时必须调用，不要自由文本罗列。

底层工具（bash-tool）：
- bash: 执行 shell 命令。用于 ls、find、grep、cat、wc 等操作。
- readFile: 读取文件完整内容。读取具体文件时用这个。
- writeFile: 创建或更新文件。生成需求文档、用户故事时用这个。

工作原则：
1. 了解项目 → 先 list_files，再针对性 readFile
2. 搜索内容 → 用 search_workspace，不要用 bash grep
3. 读写文件 → 用 readFile / writeFile
4. 复杂操作 → 才用 bash（如 wc -l、find 复杂模式）
5. 总是先用结构化工具，bash 是最后手段`;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages = [] } = body as { messages?: Awaited<ReturnType<typeof req.json>>["messages"] };
  const providerInfo = getProviderInfo();
  const { threadId, threadKey, workspaceDir } = resolveThreadWorkspace(body as {
    id?: unknown;
    messageId?: unknown;
    messages?: unknown;
  });
  await ensureWorkspaceDirectory(workspaceDir);
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

  const { tools: bashTools } = await createBashTool({
    uploadDirectory: { source: workspaceDir },
  });

  const protectedBashTool = {
    ...bashTools.bash,
    needsApproval: true,
  };

  const workspaceTools = {
    list_files: tool({
      description:
        "List files in the workspace directory tree. Returns structured file list. " +
        "Use this FIRST to understand the workspace layout before reading specific files.",
      inputSchema: jsonSchema<{ dir?: string; maxDepth?: number }>({
        type: "object",
        properties: {
          dir: { type: "string", description: "Subdirectory to list (default: workspace root)" },
          maxDepth: { type: "number", description: "Max directory depth (default: 3)" },
        },
      }),
      execute: async ({ dir, maxDepth }) => {
        const { promises: fs } = await import("node:fs");
        const targetDir = path.resolve(workspaceDir, dir || "");
        if (!targetDir.startsWith(workspaceDir)) {
          return { error: "Access denied: path outside workspace", root: dir, files: [], count: 0 };
        }
        const results: string[] = [];
        const IGNORED = new Set([".git", "node_modules", ".next", ".pnpm-store"]);

        async function walk(d: string, depth: number) {
          if (depth > (maxDepth ?? 3)) return;
          const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
          for (const entry of entries) {
            if (IGNORED.has(entry.name)) continue;
            const rel = path.relative(workspaceDir, path.join(d, entry.name));
            if (entry.isDirectory()) {
              results.push(rel + "/");
              await walk(path.join(d, entry.name), depth + 1);
            } else {
              results.push(rel);
            }
          }
        }

        await walk(targetDir, 0);
        return { root: dir || ".", files: results, count: results.length };
      },
    }),

    search_workspace: tool({
      description:
        "Full-text search across workspace files. Returns matching lines with file paths and line numbers. " +
        "Use this to find specific code, patterns, or content across the workspace.",
      inputSchema: jsonSchema<{ query: string; limit?: number }>({
        type: "object",
        properties: {
          query: { type: "string", description: "Text to search for" },
          limit: { type: "number", description: "Max results (default: 8)" },
        },
        required: ["query"],
      }),
      execute: async ({ query, limit }) => {
        const { promises: fs } = await import("node:fs");
        const maxResults = limit ?? 8;
        const IGNORED = new Set([".git", "node_modules", ".next"]);
        const matches: Array<{ path: string; line?: number; excerpt: string }> = [];

        const MAX_FILE_SIZE = 512 * 1024;
        async function search(dir: string) {
          if (matches.length >= maxResults) return;
          const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const entry of entries) {
            if (matches.length >= maxResults) break;
            if (IGNORED.has(entry.name)) continue;
            const abs = path.join(dir, entry.name);
            if (!abs.startsWith(workspaceDir)) continue;
            if (entry.isDirectory()) {
              await search(abs);
            } else {
              try {
                const stat = await fs.stat(abs);
                if (stat.size > MAX_FILE_SIZE) continue;
                const content = await fs.readFile(abs, "utf8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
                  if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                    matches.push({
                      path: path.relative(workspaceDir, abs),
                      line: i + 1,
                      excerpt: lines[i].trim().slice(0, 200),
                    });
                  }
                }
              } catch {
                // Skip unreadable files.
              }
            }
          }
        }

        await search(workspaceDir);
        return { query, total: matches.length, matches };
      },
    }),

    readFile: tool({
      description: "Read the contents of a file from the current thread workspace.",
      inputSchema: jsonSchema<{ path: string }>({
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to the file inside the workspace" },
        },
        required: ["path"],
      }),
      execute: async ({ path: targetPath }) => {
        const { promises: fs } = await import("node:fs");
        const resolvedPath = resolveWorkspacePath(workspaceDir, targetPath);
        if (!resolvedPath) {
          return { error: "Access denied: path outside workspace", path: targetPath };
        }

        try {
          const content = await fs.readFile(resolvedPath, "utf8");
          return {
            path: path.relative(workspaceDir, resolvedPath),
            content,
            charCount: content.length,
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
        description:
          "Create or overwrite a file in the current thread workspace. Use this for requirements docs and generated artifacts.",
        inputSchema: jsonSchema<{ path: string; content: string }>({
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path to the file inside the workspace" },
            content: { type: "string", description: "Full file contents to write" },
          },
          required: ["path", "content"],
        }),
        execute: async ({ path: targetPath, content }) => {
          const { promises: fs } = await import("node:fs");
          const resolvedPath = resolveWorkspacePath(workspaceDir, targetPath);
          if (!resolvedPath) {
            return { error: "Access denied: path outside workspace", path: targetPath };
          }

          await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.writeFile(resolvedPath, content, "utf8");

          return {
            success: true,
            path: path.relative(workspaceDir, resolvedPath),
            charCount: content.length,
            persisted: true,
          };
        },
      }),
      needsApproval: true,
    },

    fetch_url: customTools.fetch_url,
  };

  const allTools = {
    ...workspaceTools,
    bash: protectedBashTool,
    list_available_tools: tool({
      description: "Return the list of currently available tools. Call when the user asks what you can do or what tools are available.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => ({
        tools: Object.entries({ ...workspaceTools, bash: protectedBashTool }).map(
          ([name, t]) => ({ name, description: (t as { description?: string }).description ?? "" })
        ),
      }),
    }),
  };

  const result = streamText({
    model: reqAgentModel,
    system:
      `${SYSTEM_PROMPT}\n\n` +
      `当前会话 thread_id: ${threadId}\n` +
      `当前会话 thread_key: ${threadKey}\n` +
      `当前工作区目录: ${workspaceDir}\n` +
      "需求文档默认写入 docs/requirements.md。\n" +
      "不要使用 bash 创建、覆盖或移动文档文件；文件读写一律使用 readFile / writeFile。\n" +
      "不要依赖其他会话留下的文件，始终以当前工作区为准。",
    messages: await convertToModelMessages(messages),
    tools: allTools,
    stopWhen: stepCountIs(8),
    providerOptions: {
      openai: { store: providerInfo.wireApi === "responses" ? true : undefined },
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

  return result.toUIMessageStreamResponse({
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
          threadId,
          threadKey,
          workspaceDir,
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
