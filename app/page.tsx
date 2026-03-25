"use client";

import { useMemo, useState } from "react";
import { AssistantRuntimeProvider, Tools } from "@assistant-ui/react";
import { useAui } from "@assistant-ui/store";
import { ReqAgentUI } from "@/components/ReqAgentUI";
import { ReqRuntimeErrorBoundary } from "@/components/ReqRuntimeErrorBoundary";
import { ReqToolApprovalProvider } from "@/components/tool-ui/ReqToolApprovalContext";
import { useReqAgentRuntime } from "@/lib/thread-runtime";
import { reqAgentToolkit } from "@/lib/toolkit";
import { getOrCreateWorkspaceId } from "@/lib/workspace-client";

export default function Home() {
  const [workspaceId] = useState(() => getOrCreateWorkspaceId());
  const tools = useMemo(() => Tools({ toolkit: reqAgentToolkit }), []);
  const auiClients = useMemo(() => ({ tools }), [tools]);
  const { runtime, respondToToolApproval } = useReqAgentRuntime(workspaceId);
  const aui = useAui(auiClients);

  return (
    <ReqToolApprovalProvider
      onRespond={async ({ approvalId, approved, reason }) => {
        await respondToToolApproval({ approvalId, approved, reason });
      }}
    >
      <AssistantRuntimeProvider aui={aui} runtime={runtime}>
        <ReqRuntimeErrorBoundary>
          <ReqAgentUI workspaceId={workspaceId} />
        </ReqRuntimeErrorBoundary>
      </AssistantRuntimeProvider>
    </ReqToolApprovalProvider>
  );
}
