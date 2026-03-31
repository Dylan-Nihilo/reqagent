"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { useRemoteThreadListRuntime } from "@assistant-ui/react";
import { AssistantChatTransport, useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAui, useAuiState } from "@assistant-ui/store";
import { createAssistantStream } from "assistant-stream";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from "ai";
import {
  DEFAULT_THREAD_TITLE,
  extractTextFromThreadMessages,
  truncateThreadTitle,
  type ReqAgentStoredMessageEntry,
  type ReqAgentThreadRecord,
} from "@/lib/threads";

type RemoteThreadListAdapter = Parameters<typeof useRemoteThreadListRuntime>[0]["adapter"];
type UseAISDKRuntimeOptions = Parameters<typeof useAISDKRuntime>[1];
type ThreadHistoryAdapter = NonNullable<
  NonNullable<NonNullable<UseAISDKRuntimeOptions>["adapters"]>["history"]
>;

type ThreadListResponse = {
  workspaceId: string;
  threads: ReqAgentThreadRecord[];
};

type ThreadResponse = {
  thread: ReqAgentThreadRecord;
};

type ThreadMessagesResponse = {
  threadId: string;
  headId: string | null;
  messages: ReqAgentStoredMessageEntry[];
};

type HistoryFormatPayload = {
  id: string;
  parent_id: string | null;
  format: string;
  content: unknown;
};

type HistoryWriteItem = {
  message: unknown;
  parentId: string | null;
};

type HistoryFormatAdapter = {
  format: string;
  decode(payload: HistoryFormatPayload): unknown;
  encode(item: HistoryWriteItem): unknown;
  getId(message: unknown): string;
};

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function createReqAgentThreadListAdapter(workspaceId: string): RemoteThreadListAdapter {
  return {
    async list() {
      const data = await fetchJson<ThreadListResponse>(
        `/api/threads?workspaceId=${encodeURIComponent(workspaceId)}&includeArchived=1`,
      );

      return {
        threads: data.threads.map((thread) => ({
          remoteId: thread.id,
          externalId: undefined,
          status: thread.isArchived ? "archived" : "regular",
          title: thread.title,
        })),
      };
    },

    async initialize() {
      const data = await fetchJson<ThreadResponse>("/api/threads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId }),
      });

      return {
        remoteId: data.thread.id,
        externalId: undefined,
      };
    },

    async rename(remoteId, newTitle) {
      await fetchJson<ThreadResponse>(`/api/threads/${encodeURIComponent(remoteId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });
    },

    async archive(remoteId) {
      await fetchJson<ThreadResponse>(`/api/threads/${encodeURIComponent(remoteId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isArchived: true }),
      });
    },

    async unarchive(remoteId) {
      await fetchJson<ThreadResponse>(`/api/threads/${encodeURIComponent(remoteId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isArchived: false }),
      });
    },

    async delete(remoteId) {
      await fetchJson<ThreadResponse>(`/api/threads/${encodeURIComponent(remoteId)}`, {
        method: "DELETE",
      });
    },

    async fetch(threadId) {
      const data = await fetchJson<ThreadResponse>(`/api/threads/${encodeURIComponent(threadId)}`);
      return {
        remoteId: data.thread.id,
        externalId: undefined,
        status: data.thread.isArchived ? "archived" : "regular",
        title: data.thread.title,
      };
    },

    async generateTitle(remoteId, messages) {
      const inferredText = extractTextFromThreadMessages(messages);
      const title = truncateThreadTitle(inferredText || DEFAULT_THREAD_TITLE);

      if (title && title !== DEFAULT_THREAD_TITLE) {
        await fetchJson<ThreadResponse>(`/api/threads/${encodeURIComponent(remoteId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        });
      }

      return createAssistantStream((controller) => {
        if (title) {
          controller.appendText(title);
        }
      });
    },
  };
}

function createReqAgentThreadHistoryAdapter(
  aui: ReturnType<typeof useAui>,
  workspaceId: string,
): ThreadHistoryAdapter {
  return {
    async load() {
      return { messages: [] };
    },

    async append() {
      // Persistence uses `withFormat()` below.
    },

    withFormat(formatAdapter: HistoryFormatAdapter) {
      return {
        async load() {
          const remoteId = aui.threadListItem().getState().remoteId;
          if (!remoteId) {
            return { messages: [] };
          }

          const data = await fetchJson<ThreadMessagesResponse>(
            `/api/threads/${encodeURIComponent(remoteId)}/messages`,
          );

          return {
            headId: data.headId,
            messages: data.messages.map((message) =>
              formatAdapter.decode({
                id: message.id,
                parent_id: message.parentId,
                format: message.format,
                content: message.content,
              }),
            ),
          };
        },

        async append(item: HistoryWriteItem) {
          const current = aui.threadListItem().getState();
          const remoteId = current.remoteId ?? (await aui.threadListItem().initialize()).remoteId;
          const messageId = formatAdapter.getId(item.message).trim();
          if (!messageId) return;

          await fetchJson<{ ok: true }>(
            `/api/threads/${encodeURIComponent(remoteId)}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                workspaceId,
                item: {
                  id: messageId,
                  parentId: item.parentId,
                  format: formatAdapter.format,
                  content: formatAdapter.encode(item),
                },
              }),
            },
          );
        },

        async update(item: HistoryWriteItem) {
          const current = aui.threadListItem().getState();
          const remoteId = current.remoteId ?? (await aui.threadListItem().initialize()).remoteId;
          const messageId = formatAdapter.getId(item.message).trim();
          if (!messageId) return;

          await fetchJson<{ ok: true }>(
            `/api/threads/${encodeURIComponent(remoteId)}/messages`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                workspaceId,
                item: {
                  id: messageId,
                  parentId: item.parentId,
                  format: formatAdapter.format,
                  content: formatAdapter.encode(item),
                },
              }),
            },
          );
        },
      };
    },
  } as ThreadHistoryAdapter;
}

export function useReqAgentRuntime(workspaceId: string) {
  const adapter = useMemo(() => createReqAgentThreadListAdapter(workspaceId), [workspaceId]);
  const approvalResponderRef = useRef<
    ((response: { id: string; approved: boolean; reason?: string }) => PromiseLike<void> | void) | null
  >(null);

  const runtime = useRemoteThreadListRuntime({
    adapter,
    allowNesting: true,
    runtimeHook: function ReqAgentThreadRuntime() {
      const aui = useAui();
      const localThreadId = useAuiState((state) => state.threadListItem.id);
      const transport = useMemo(
        () =>
          new AssistantChatTransport({
            api: "/api/chat",
            prepareSendMessagesRequest: async (options) => {
              const current = aui.threadListItem().getState();
              const remoteId =
                current.remoteId ?? (await aui.threadListItem().initialize()).remoteId;

              return {
                ...options,
                body: {
                  ...options.body,
                  id: options.id,
                  messages: options.messages,
                  trigger: options.trigger,
                  messageId: options.messageId,
                  metadata: options.requestMetadata,
                  workspaceId,
                  threadId: remoteId,
                  localThreadId,
                },
              };
            },
          }),
        [aui, localThreadId],
      );
      const history = useMemo(
        () => createReqAgentThreadHistoryAdapter(aui, workspaceId),
        [aui],
      );
      const chat = useChat<UIMessage>({
        id: localThreadId,
        transport,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
      });
      useEffect(() => {
        approvalResponderRef.current = chat.addToolApprovalResponse;
        return () => {
          if (approvalResponderRef.current === chat.addToolApprovalResponse) {
            approvalResponderRef.current = null;
          }
        };
      }, [chat]);
      const runtime = useAISDKRuntime(chat, {
        adapters: {
          history,
        },
      });

      useEffect(() => {
        transport.setRuntime(runtime);
      }, [transport, runtime]);

      return runtime;
    },
  });

  const respondToToolApproval = useCallback(
    async ({ approvalId, approved, reason }: { approvalId: string; approved: boolean; reason?: string }) => {
      if (!approvalResponderRef.current) {
        throw new Error("Tool approval runtime is not ready");
      }

      await approvalResponderRef.current({
        id: approvalId,
        approved,
        reason,
      });
    },
    [],
  );

  return {
    runtime,
    respondToToolApproval,
  };
}
