import {
  streamText,
  generateText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { getProviderInfo, reqAgentModel } from "@/lib/ai-provider";
import {
  appendChatTrace,
  buildStepTracePayload,
  getLatestUserMessageText,
} from "@/lib/chat-trace";
import {
  ensureThread,
  getThreadSummary,
  getThreadWorkspaceId,
  getWorkspaceSummary,
  setThreadSummary,
  setWorkspaceSummary,
  syncThreadUiMessages,
} from "@/lib/db/store";
import type { ToolInvocationViewState } from "@/lib/types";
import {
  buildExecutionContext,
  buildSystemBlocks,
  serializePromptBlocks,
} from "@/lib/harness/prompt-blocks";
import { buildRuntimeCapabilities } from "@/lib/harness/runtime-capabilities";
import {
  formatWorkspaceSummary,
  mergeWorkspaceSummary,
  prepareThreadSummaryContext,
} from "@/lib/harness/thread-summary";
import {
  ensureWorkspaceDirectory,
  readNonEmptyString,
  resolveRuntimeContext,
} from "@/lib/workspace/context";
import { buildMetadataHandler } from "@/lib/workspace/streaming-metadata";
import { buildDocxClarificationHint, getDocxClarificationState } from "@/lib/docx-workflow";

export const maxDuration = 60;

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
  const lastUserText = getLatestUserMessageText(uiMessages);
  void appendChatTrace(runtimeContext, "request.received", {
    messageCount: uiMessages.length,
    lastUserText,
    provider: providerInfo.providerName,
    model: providerInfo.model,
    wireApi: providerInfo.wireApi,
  }).catch((error) => {
    console.error("[ReqAgent trace] failed to append request trace", error);
  });

  const toolInvocationStates: Record<string, ToolInvocationViewState> = {};
  const docxClarificationState = getDocxClarificationState(uiMessages);
  const docxClarificationHint = buildDocxClarificationHint(docxClarificationState);
  const storedThreadSummary = getThreadSummary(runtimeContext.threadId);
  const storedWorkspaceSummary = getWorkspaceSummary(runtimeContext.workspaceId);
  const threadSummaryContext = await prepareThreadSummaryContext({
    model: reqAgentModel,
    messages: uiMessages,
    currentSummary: storedThreadSummary,
  });
  if (threadSummaryContext.nextSummary) {
    setThreadSummary(runtimeContext.threadId, threadSummaryContext.nextSummary);
  }
  const runtimeCapabilities = await buildRuntimeCapabilities({
    runtimeContext,
    uiMessages,
  });
  const executionContext = buildExecutionContext({
    runtimeContext,
    threadSummaryText: threadSummaryContext.threadSummaryText,
    workspaceSummaryText: formatWorkspaceSummary(storedWorkspaceSummary),
  });
  const promptBlocks = buildSystemBlocks({
    executionContext,
    capabilityBlocks: runtimeCapabilities.promptBlocks,
    docxClarificationHint,
  });
  const serializedSystemPrompt = serializePromptBlocks(promptBlocks);
  const promptBlockDebug = promptBlocks.map((block) => ({
    key: block.key,
    dynamic: block.dynamic,
    charCount: block.content.length,
  }));
  void appendChatTrace(runtimeContext, "prompt.prepared", {
    matchedSkills: runtimeCapabilities.matchedSkills.map((skill) => skill.id),
    mcpServers: runtimeCapabilities.mcpRuntime.servers.map((server) => ({
      id: server.id,
      state: server.state,
      toolCount: server.toolCount,
    })),
    promptBlocks: promptBlockDebug,
    capabilitySnapshot: runtimeCapabilities.capabilitySnapshot,
    docxClarification: docxClarificationState,
  }).catch((error) => {
    console.error("[ReqAgent trace] failed to append prompt trace", error);
  });

  const metadata = buildMetadataHandler({
    runtimeContext,
    mcpServers: runtimeCapabilities.mcpRuntime.servers,
    providerInfo,
    docxClarification: docxClarificationState,
    toolInvocationStates,
    matchedSkills: runtimeCapabilities.matchedSkills,
    promptBlocks: promptBlockDebug,
    capabilitySnapshot: runtimeCapabilities.capabilitySnapshot,
  });

  let result;
  try {
    result = streamText({
      model: reqAgentModel,
      system: serializedSystemPrompt,
      messages: await convertToModelMessages([...threadSummaryContext.modelMessages]),
      tools: runtimeCapabilities.allTools,
      stopWhen: stepCountIs(8),
      experimental_repairToolCall: async ({ toolCall, inputSchema, messages }) => {
        console.log(`[ReqAgent repair] tool=${toolCall.toolName} input=${toolCall.input?.slice(0, 80)}`);
        const schema = await inputSchema({ toolName: toolCall.toolName });
        const { text } = await generateText({
          model: reqAgentModel,
          system: "You repair a malformed or truncated tool call JSON. Return ONLY valid JSON that matches the schema. No explanation.",
          prompt: `Tool: ${toolCall.toolName}\nSchema: ${JSON.stringify(schema)}\nMalformed input: ${toolCall.input}\nUser message context: ${JSON.stringify(messages.slice(-2))}\n\nReturn valid JSON only:`,
        });
        try {
          JSON.parse(text.trim());
          return { ...toolCall, input: text.trim() };
        } catch {
          return null;
        }
      },
      providerOptions: {
        openai: { store: providerInfo.wireApi === "responses" ? true : undefined },
      },
      onFinish: async () => {
        await runtimeCapabilities.mcpRuntime.cleanup();
      },
      onStepFinish: ({ toolCalls, toolResults, text, finishReason }) => {
        const stepPayload = {
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
        };
        metadata.recordStep(stepPayload);
        void appendChatTrace(
          runtimeContext,
          "step.finished",
          buildStepTracePayload(stepPayload),
        ).catch((error) => {
          console.error("[ReqAgent trace] failed to append step trace", error);
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
    await runtimeCapabilities.mcpRuntime.cleanup();
    throw error;
  }

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    onFinish: async ({ messages: finalMessages }) => {
      syncThreadUiMessages(runtimeContext.threadId, finalMessages);
      const nextWorkspaceSummary = mergeWorkspaceSummary(storedWorkspaceSummary, finalMessages);
      if (nextWorkspaceSummary) {
        setWorkspaceSummary(runtimeContext.workspaceId, nextWorkspaceSummary);
      }
      await appendChatTrace(runtimeContext, "response.finished", {
        finalMessageCount: finalMessages.length,
        workspaceSummaryTrackedFiles: nextWorkspaceSummary?.trackedFiles ?? [],
      }).catch((error) => {
        console.error("[ReqAgent trace] failed to append finish trace", error);
      });
    },
    sendReasoning: true,
    messageMetadata: metadata.messageMetadata,
  });
}
