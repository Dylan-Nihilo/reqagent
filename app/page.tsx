"use client";

import { useEffect, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { AssistantRuntimeProvider, Tools } from "@assistant-ui/react";
import { AssistantChatTransport, useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAui } from "@assistant-ui/store";
import { ReqAgentUI } from "@/components/ReqAgentUI";
import { ReqRuntimeErrorBoundary } from "@/components/ReqRuntimeErrorBoundary";
import { ReqToolApprovalProvider } from "@/components/tool-ui/ReqToolApprovalContext";
import { reqAgentToolkit } from "@/lib/toolkit";

const WORKSPACE_STORAGE_KEY = "reqagent.activeWorkspaceId";

function getOrCreateWorkspaceId() {
  if (typeof window === "undefined") return "ws_browser_pending";

  const existing = window.localStorage.getItem(WORKSPACE_STORAGE_KEY)?.trim();
  if (existing) return existing;

  const workspaceId = `ws_${crypto.randomUUID()}`;
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
  return workspaceId;
}

export default function Home() {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async (options) => {
          const workspaceId = getOrCreateWorkspaceId();
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
            },
          };
        },
      }),
    [],
  );
  const tools = useMemo(() => Tools({ toolkit: reqAgentToolkit }), []);
  const auiClients = useMemo(() => ({ tools }), [tools]);
  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  const runtime = useAISDKRuntime(chat);
  const aui = useAui(auiClients);

  useEffect(() => {
    transport.setRuntime(runtime);
  }, [transport, runtime]);

  return (
    <ReqToolApprovalProvider
      onRespond={async ({ approvalId, approved, reason }) => {
        await chat.addToolApprovalResponse({
          id: approvalId,
          approved,
          reason,
        });
      }}
    >
      <AssistantRuntimeProvider aui={aui} runtime={runtime}>
        <ReqRuntimeErrorBoundary>
          <ReqAgentUI />
        </ReqRuntimeErrorBoundary>
      </AssistantRuntimeProvider>
    </ReqToolApprovalProvider>
  );
}
