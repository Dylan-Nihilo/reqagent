import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { getProviderInfo, reqAgentModel } from "@/lib/ai-provider";
import {
  ensureThread,
  getThreadWorkspaceId,
  syncThreadUiMessages,
} from "@/lib/db/store";
import { buildMcpRuntime } from "@/lib/mcp";
import type { ToolInvocationViewState } from "@/lib/types";
import {
  ensureWorkspaceDirectory,
  readNonEmptyString,
  resolveRuntimeContext,
} from "@/lib/workspace/context";
import { buildMetadataHandler } from "@/lib/workspace/streaming-metadata";
import { buildWorkspaceTools } from "@/lib/workspace/workspace-tools";

export const maxDuration = 60;

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
  const mcpRuntime = await buildMcpRuntime({
    workspaceId: runtimeContext.workspaceId,
    workspaceKey: runtimeContext.workspaceKey,
    workspaceDir: runtimeContext.workspaceDir,
    threadId: runtimeContext.threadId,
    threadKey: runtimeContext.threadKey,
  });
  const workspaceTools = buildWorkspaceTools(runtimeContext, mcpRuntime);
  const allTools = {
    ...workspaceTools,
    ...mcpRuntime.tools,
  };
  const metadata = buildMetadataHandler({
    runtimeContext,
    mcpServers: mcpRuntime.servers,
    providerInfo,
    toolInvocationStates,
  });

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
        metadata.recordStep({
          finishReason,
          text,
          toolCalls: toolCalls.map((toolCall) => ({
            toolName: toolCall.toolName,
            input: toolCall.input,
          })),
          toolResults: toolResults.map((toolResult) => {
            const candidate = toolResult as Record<string, unknown>;
            return {
              toolName: candidate.toolName,
              output: candidate.output,
              result: candidate.result,
            };
          }),
        });

        if (toolCalls.length > 0) {
          console.log(
            "[ReqAgent step] tools:",
            toolCalls.map((toolCall) => `${toolCall.toolName}(${JSON.stringify(toolCall.input).slice(0, 120)})`),
          );
        }
        if (text) {
          console.log(`[ReqAgent step] text: ${text.slice(0, 80)}...`);
        }
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
    messageMetadata: metadata.messageMetadata,
  });
}
