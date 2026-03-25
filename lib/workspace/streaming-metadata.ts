import type { ProviderInfo } from "@/lib/ai-provider";
import type { ReqAgentMcpServerStatus } from "@/lib/mcp";
import type { ToolInvocationViewState } from "@/lib/types";
import type { RuntimeContext } from "@/lib/workspace/context";
import { summarizeForDebug } from "@/lib/workspace/context";

type DebugEvent = {
  index: number;
  type: string;
  id?: string;
  toolCallId?: string;
  preliminary?: boolean;
};

type DebugStep = {
  index: number;
  finishReason: string;
  textPreview?: string;
  toolCalls: Array<{ toolName: string; input?: unknown }>;
  toolResults: Array<{ toolName: string; outputPreview: string }>;
};

type MetadataChunk = {
  id?: string;
  preliminary?: boolean;
  toolCall?: { toolCallId?: string };
  toolCallId?: string;
  type: string;
};

export function buildMetadataHandler(params: {
  runtimeContext: RuntimeContext;
  mcpServers: ReqAgentMcpServerStatus[];
  providerInfo: ProviderInfo;
  toolInvocationStates: Record<string, ToolInvocationViewState>;
}) {
  const debugEvents: DebugEvent[] = [];
  const debugSteps: DebugStep[] = [];
  let debugEventIndex = 0;
  let debugStepIndex = 0;

  return {
    recordStep(input: {
      finishReason: string;
      text?: string;
      toolCalls: Array<{ toolName: string; input?: unknown }>;
      toolResults: Array<{ toolName?: unknown; output?: unknown; result?: unknown }>;
    }) {
      debugSteps.push({
        index: ++debugStepIndex,
        finishReason: input.finishReason,
        textPreview: input.text ? summarizeForDebug(input.text, 320) : undefined,
        toolCalls: input.toolCalls.map((toolCall) => ({
          toolName: toolCall.toolName,
          input: toolCall.input,
        })),
        toolResults: input.toolResults.map((toolResult) => ({
          toolName: String(toolResult.toolName ?? "unknown"),
          outputPreview: summarizeForDebug(toolResult.output ?? toolResult.result ?? toolResult, 240),
        })),
      });
      if (debugSteps.length > 12) debugSteps.shift();
    },

    messageMetadata({ part }: { part: unknown }) {
      const chunk = part as MetadataChunk;
      const event = {
        index: ++debugEventIndex,
        type: chunk.type,
        id: chunk.id,
        toolCallId: chunk.toolCallId ?? chunk.toolCall?.toolCallId,
        preliminary: chunk.preliminary,
      };
      debugEvents.push(event);
      if (debugEvents.length > 48) debugEvents.shift();

      const basePayload = {
        activeRole: null,
        debug: {
          threadId: params.runtimeContext.threadId,
          threadKey: params.runtimeContext.threadKey,
          workspaceId: params.runtimeContext.workspaceId,
          workspaceKey: params.runtimeContext.workspaceKey,
          workspaceDir: params.runtimeContext.workspaceDir,
          mcpServers: params.mcpServers,
          lastEvent: event,
          events: [...debugEvents],
          steps: [...debugSteps],
        },
        model: params.providerInfo.model,
        publicThinking: "",
        toolInvocationStates: { ...params.toolInvocationStates },
        wireApi: params.providerInfo.wireApi,
      };

      const withToolState = (toolCallId: string, state: ToolInvocationViewState, phaseLabel: string) => {
        params.toolInvocationStates[toolCallId] = state;
        return {
          custom: {
            ...basePayload,
            agentActivity: "tool_calling" as const,
            phaseLabel,
            toolInvocationStates: { ...params.toolInvocationStates },
          },
        };
      };

      switch (chunk.type) {
        case "tool-input-start":
          return withToolState(chunk.toolCallId ?? chunk.id ?? "unknown", "drafting_input", "组装参数");
        case "tool-input-available":
          return withToolState(chunk.toolCallId ?? chunk.id ?? "unknown", "input_ready", "工具调用");
        case "tool-approval-request":
          return withToolState(
            chunk.toolCall?.toolCallId ?? chunk.toolCallId ?? "unknown",
            "awaiting_approval",
            "等待批准",
          );
        case "tool-output-available":
          return withToolState(
            chunk.toolCallId ?? "unknown",
            chunk.preliminary ? "streaming_output" : "succeeded",
            chunk.preliminary ? "输出流" : "工具完成",
          );
        case "tool-error":
          return withToolState(chunk.toolCallId ?? "unknown", "failed", "工具失败");
        case "tool-output-denied":
          return withToolState(chunk.toolCallId ?? "unknown", "denied", "已拒绝");
        case "text-start":
        case "text-delta":
          return {
            custom: {
              model: params.providerInfo.model,
              wireApi: params.providerInfo.wireApi,
              activeRole: null,
              agentActivity: "responding" as const,
              phaseLabel: "生成回复",
              publicThinking: "",
              toolInvocationStates: { ...params.toolInvocationStates },
            },
          };
        case "reasoning-start":
        case "reasoning-delta":
          return {
            custom: {
              model: params.providerInfo.model,
              wireApi: params.providerInfo.wireApi,
              activeRole: null,
              agentActivity: "thinking" as const,
              phaseLabel: "推理",
              publicThinking: "",
              toolInvocationStates: { ...params.toolInvocationStates },
            },
          };
        default:
          return { custom: { ...basePayload, agentActivity: "responding", phaseLabel: "对话" } };
      }
    },
  };
}
