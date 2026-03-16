"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { ReqAgentUI } from "@/components/ReqAgentUI";
import { useReqAgentRuntime } from "@/lib/useReqAgentRuntime";

export default function Home() {
  const runtime = useReqAgentRuntime({ api: "/api/chat" });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReqAgentUI />
    </AssistantRuntimeProvider>
  );
}
