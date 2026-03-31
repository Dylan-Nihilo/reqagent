import type { UIMessage } from "ai";
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
import { AgentLoopController } from "@/lib/harness/agent-loop";
import { HookRegistry } from "@/lib/harness/hooks";
import { registerBuiltinHooks } from "@/lib/harness/builtin-hooks";
import { PermissionPolicy } from "@/lib/harness/permissions";
import { ContextBudget } from "@/lib/harness/context-budget";
import { readHarnessConfig } from "@/lib/harness/harness-config";
import type { AgentEvent } from "@/lib/harness/agent-events";

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

  // ---------------------------------------------------------------------------
  // Harness setup — AgentLoopController + Hooks + Permissions + Budget
  // ---------------------------------------------------------------------------

  const harnessConfig = await readHarnessConfig();

  const hookRegistry = new HookRegistry();
  const permissionPolicy = new PermissionPolicy();
  const contextBudget = new ContextBudget({
    maxTokens: harnessConfig.compaction.maxTokens ?? 128_000,
    warningThreshold: harnessConfig.compaction.warningThreshold,
    compactionThreshold: harnessConfig.compaction.compactionThreshold,
    retainRecentCount: harnessConfig.compaction.retainRecentCount,
  });

  // Track current context usage
  contextBudget.track(uiMessages as Array<{ content?: string; parts?: unknown[] }>);

  registerBuiltinHooks(hookRegistry, {
    policy: permissionPolicy,
    audit: { traceContext: runtimeContext },
    budget: {
      maxSteps: harnessConfig.maxSteps,
      maxTokens: harnessConfig.hooks.budgetLimit?.maxTokens,
    },
  });

  const loopController = new AgentLoopController({
    config: {
      maxSteps: harnessConfig.maxSteps,
      stepTimeoutMs: harnessConfig.stepTimeoutMs,
      interruptible: harnessConfig.interruptible,
    },
    hooks: hookRegistry,
    contextBudget,
  });

  // Collect harness events for debug metadata
  const harnessEvents: AgentEvent[] = [];
  const hooksFired: string[] = [];
  const permissionDecisions: Record<string, "allow" | "deny" | "ask"> = {};

  let result;
  try {
    result = await loopController.run(
      {
        model: reqAgentModel,
        system: serializedSystemPrompt,
        messages: threadSummaryContext.modelMessages,
        tools: runtimeCapabilities.allTools,
        providerOptions: {
          openai: { store: providerInfo.wireApi === "responses" ? true : undefined },
        },
        onFinish: async () => {
          await runtimeCapabilities.mcpRuntime.cleanup();
        },
      },
      {
        onStep: (step, stepResult) => {
          const stepPayload = {
            finishReason: stepResult.finishReason,
            text: stepResult.text,
            toolCalls: stepResult.toolCalls.map((tc) => ({
              toolName: tc.toolName,
              input: tc.input,
            })),
            toolResults: stepResult.toolResults.map((tr) => ({
              toolName: tr.toolName,
              output: tr.output,
              result: tr.output,
            })),
          };
          metadata.recordStep(stepPayload);
          void appendChatTrace(
            runtimeContext,
            "step.finished",
            buildStepTracePayload(stepPayload),
          ).catch((error) => {
            console.error("[ReqAgent trace] failed to append step trace", error);
          });

          if (stepResult.toolCalls.length > 0) {
            console.log(
              "[ReqAgent step] tools:",
              stepResult.toolCalls.map((tc) => `${tc.toolName}(${JSON.stringify(tc.input).slice(0, 120)})`),
            );
          }
          if (stepResult.text) {
            console.log(`[ReqAgent step] text: ${stepResult.text.slice(0, 80)}...`);
          }
          console.log(`[ReqAgent step] finish: ${stepResult.finishReason}, toolResults: ${stepResult.toolResults.length}`);
        },
        onEvent: (event) => {
          harnessEvents.push(event);
          if (event.type === "tool_call") {
            hooksFired.push(`pre_tool_use:${event.toolName}`);
          }
          if (event.type === "tool_result") {
            hooksFired.push(`post_tool_use:${event.toolName}`);
          }
        },
      },
    );
  } catch (error) {
    await runtimeCapabilities.mcpRuntime.cleanup();
    throw error;
  }

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    onFinish: async ({ messages: finalMessages }: { messages: UIMessage[] }) => {
      // Finalize loop and emit loop_end event
      const loopEnd = loopController.finalize();
      harnessEvents.push(loopEnd);

      void appendChatTrace(runtimeContext, "harness.loop_end", {
        totalSteps: loopEnd.type === "loop_end" ? loopEnd.totalSteps : 0,
        reason: loopEnd.type === "loop_end" ? loopEnd.reason : "unknown",
        hooksFired,
        permissionDecisions,
        contextBudget: contextBudget.snapshot(),
      }).catch((error) => {
        console.error("[ReqAgent trace] failed to append harness trace", error);
      });

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
