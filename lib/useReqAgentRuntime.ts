"use client";

import {
  INTERNAL,
  useLocalRuntime,
  type AssistantRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type LocalRuntimeOptions,
  type ThreadMessage,
} from "@assistant-ui/react";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { AssistantMessageAccumulator, DataStreamDecoder, unstable_toolResultStream } from "assistant-stream";
import { asAsyncIterableStream } from "assistant-stream/utils";

type HeadersValue = Record<string, string> | Headers;

export type UseReqAgentRuntimeOptions = {
  api: string;
  onResponse?: (response: Response) => void | Promise<void>;
  onFinish?: (message: ThreadMessage) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
  credentials?: RequestCredentials;
  headers?: HeadersValue | (() => Promise<HeadersValue>);
  body?: object;
  sendExtraMessageFields?: boolean;
} & LocalRuntimeOptions;

const { splitLocalRuntimeOptions } = INTERNAL;

const toAISDKTools = (tools: Record<string, { description?: string; parameters?: unknown }>) =>
  Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...(tool.description ? { description: tool.description } : {}),
        parameters: tool.parameters instanceof z.ZodType ? zodToJsonSchema(tool.parameters) : tool.parameters ?? {},
      },
    ]),
  );

const getEnabledTools = (tools: Record<string, { description?: string; parameters?: unknown; disabled?: boolean; type?: string }> = {}) =>
  Object.fromEntries(Object.entries(tools).filter(([, tool]) => !tool.disabled && tool.type !== "backend"));

function toLanguageModelMessages(messages: readonly ThreadMessage[], includeId = false) {
  return messages.flatMap((message) => {
    if (message.role === "system") {
      return [
        {
          ...(includeId ? { unstable_id: message.id } : {}),
          role: "system" as const,
          content: message.content[0]?.text ?? "",
        },
      ];
    }

    if (message.role === "user") {
      return [
        {
          ...(includeId ? { unstable_id: message.id } : {}),
          role: "user" as const,
          content: message.content,
        },
      ];
    }

    const assistantContent: Array<{ type: "text"; text: string } | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }> = [];
    const toolContent: Array<{ type: "tool-result"; toolCallId: string; toolName: string; result: unknown; isError: boolean; artifact?: unknown }> = [];
    const emitted: Array<Record<string, unknown>> = [];

    for (const part of message.content) {
      if (part.type === "text") {
        if (toolContent.length > 0) {
          emitted.push({ role: "assistant", content: assistantContent });
          emitted.push({ role: "tool", content: toolContent });
          assistantContent.length = 0;
          toolContent.length = 0;
        }

        assistantContent.push({ type: "text", text: part.text });
      }

      if (part.type === "tool-call") {
        assistantContent.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: part.args,
        });

        toolContent.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          ...(part.artifact !== undefined ? { artifact: part.artifact } : {}),
          result: part.result ?? "Error: tool returned no result",
          isError: part.isError ?? part.result === undefined,
        });
      }
    }

    if (assistantContent.length > 0) {
      emitted.push({
        ...(includeId ? { unstable_id: message.id } : {}),
        role: "assistant",
        content: assistantContent,
      });
    }

    if (toolContent.length > 0) {
      emitted.push({ role: "tool", content: toolContent });
    }

    return emitted;
  });
}

class ReqAgentRuntimeAdapter implements ChatModelAdapter {
  constructor(private readonly options: Omit<UseReqAgentRuntimeOptions, keyof LocalRuntimeOptions>) {}

  async *run({
    messages,
    runConfig,
    abortSignal,
    context,
    unstable_assistantMessageId,
    unstable_getMessage,
  }: ChatModelRunOptions) {
    const headersValue = typeof this.options.headers === "function" ? await this.options.headers() : this.options.headers;

    abortSignal.addEventListener(
      "abort",
      () => {
        if (!(abortSignal.reason as { detach?: boolean } | undefined)?.detach) {
          this.options.onCancel?.();
        }
      },
      { once: true },
    );

    const headers = new Headers(headersValue);
    headers.set("Content-Type", "application/json");

    const response = await fetch(this.options.api, {
      method: "POST",
      headers,
      credentials: this.options.credentials ?? "same-origin",
      body: JSON.stringify({
        system: context.system,
        messages: toLanguageModelMessages(messages, this.options.sendExtraMessageFields),
        tools: toAISDKTools(
          getEnabledTools(
            context.tools as Record<string, { description?: string; parameters?: unknown; disabled?: boolean; type?: string }> | undefined,
          ) as Record<string, { description?: string; parameters?: unknown }>,
        ),
        ...(unstable_assistantMessageId ? { unstable_assistantMessageId } : {}),
        runConfig,
        state: unstable_getMessage().metadata.unstable_state || undefined,
        ...context.callSettings,
        ...context.config,
        ...this.options.body,
      }),
      signal: abortSignal,
    });

    await this.options.onResponse?.(response);

    try {
      if (!response.ok) {
        throw new Error(`Status ${response.status}: ${await response.text()}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const stream = response.body
        .pipeThrough(new DataStreamDecoder())
        .pipeThrough(unstable_toolResultStream(context.tools, abortSignal, async () => undefined))
        .pipeThrough(new AssistantMessageAccumulator());

      yield* asAsyncIterableStream(stream);
      this.options.onFinish?.(unstable_getMessage());
    } catch (error) {
      const runtimeError = error instanceof Error ? error : new Error("ReqAgent runtime failed");
      this.options.onError?.(runtimeError);
      throw runtimeError;
    }
  }
}

export function useReqAgentRuntime(options: UseReqAgentRuntimeOptions): AssistantRuntime {
  const { localRuntimeOptions, otherOptions } = splitLocalRuntimeOptions(options);
  return useLocalRuntime(new ReqAgentRuntimeAdapter(otherOptions), localRuntimeOptions);
}
