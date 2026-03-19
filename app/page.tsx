"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { ReqAgentUI } from "@/components/ReqAgentUI";
import { reqAgentThreadStateSchema, type ReqAgentUIMessage } from "@/lib/types";

export default function Home() {
  const runtime = useChatRuntime<ReqAgentUIMessage>({
    messageMetadataSchema: reqAgentThreadStateSchema,
    transport: new AssistantChatTransport<ReqAgentUIMessage>({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReqAgentUI />
    </AssistantRuntimeProvider>
  );
}
