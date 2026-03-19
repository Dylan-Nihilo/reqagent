"use client";

import { MessagePrimitive, ThreadPrimitive, useThread } from "@assistant-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArtifactPanel } from "@/components/ArtifactPanel";
import { ReqComposer } from "@/components/ReqComposer";
import { ReqEmptyState } from "@/components/ReqEmptyState";
import { ReqMessage } from "@/components/ReqMessage";
import { ReqAgentWorkbench } from "@/components/ReqAgentWorkbench";
import { ReqAgentWorkbenchScene } from "@/components/ReqAgentWorkbenchScene";
import { ReqScrollToBottom } from "@/components/ReqScrollToBottom";
import { ReqThinkingBlock } from "@/components/ReqThinkingBlock";
import { GenerateDocToolUI } from "@/components/tool-uis/GenerateDocToolUI";
import { GenerateStoriesToolUI } from "@/components/tool-uis/GenerateStoriesToolUI";
import { ParseInputToolUI } from "@/components/tool-uis/ParseInputToolUI";
import { SearchKnowledgeToolUI } from "@/components/tool-uis/SearchKnowledgeToolUI";
import styles from "@/components/ReqAgentWorkbench.module.css";
import { getLatestReqAgentThreadState, reqAgentStageLabels, type ReqAgentThreadState } from "@/lib/types";

type MessagePartLike = {
  type?: string;
  text?: string;
};

type MessageLike = {
  role?: string;
  metadata?: unknown;
  parts?: MessagePartLike[];
};

export function ReqAgentUI() {
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [runEndedAt, setRunEndedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(() => Date.now());

  const lastRunIdRef = useRef<string | null>(null);
  const messages = useThread((state) => state.messages) as readonly MessageLike[];
  const isRunning = useThread((state) => state.isRunning);

  const hasConversation = messages.length > 0;
  const threadState = useMemo(() => getLatestReqAgentThreadState(messages), [messages]);

  const artifacts = threadState?.artifacts ?? {};
  const artifactCount = Number(Boolean(artifacts.stories)) + Number(Boolean(artifacts.doc));
  const hasArtifacts = artifactCount > 0;
  const currentAgent = threadState?.activeRole ?? "Orchestrator";
  const activeStage = threadState?.activeStage ?? null;
  const workflowStatus = threadState?.workflowStatus ?? "idle";
  const threadTitle = threadState?.threadTitle || getFallbackThreadTitle(messages);
  const thinkingSummary = getThinkingSummary(threadState);
  const thinkingMode = getThinkingMode(workflowStatus);
  const elapsedLabel = formatElapsedLabel(runStartedAt, runEndedAt, tick);

  useEffect(() => {
    const nextRunId = threadState?.runId ?? null;
    if (!nextRunId || lastRunIdRef.current === nextRunId) {
      return;
    }

    lastRunIdRef.current = nextRunId;
    const now = Date.now();
    setRunStartedAt(now);
    setRunEndedAt(null);
    setTick(now);
    setThinkingOpen(true);
  }, [threadState?.runId]);

  useEffect(() => {
    if (!threadState || workflowStatus === "idle") {
      return;
    }

    if (runStartedAt == null) {
      const now = Date.now();
      setRunStartedAt(now);
      if (workflowStatus !== "running") {
        setRunEndedAt(now);
      }
      return;
    }

    if (workflowStatus === "running") {
      setRunEndedAt(null);
      return;
    }

    setRunEndedAt((current) => current ?? Date.now());
  }, [threadState, workflowStatus, runStartedAt]);

  useEffect(() => {
    if (!isRunning || runStartedAt == null || runEndedAt != null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isRunning, runEndedAt, runStartedAt]);

  useEffect(() => {
    if (!hasArtifacts) {
      setArtifactsOpen(false);
      return;
    }

    setArtifactsOpen(true);
  }, [hasArtifacts]);

  useEffect(() => {
    if (hasConversation) {
      return;
    }

    lastRunIdRef.current = null;
    setNavOpen(false);
    setArtifactsOpen(false);
    setRunStartedAt(null);
    setRunEndedAt(null);
  }, [hasConversation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setNavOpen(false);
      setArtifactsOpen(false);
      setThinkingOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!hasConversation) {
    return (
      <main className={styles.page}>
        <ToolRegistry />
        <div className={`${styles.shell} ${styles.shellLanding}`}>
          <section className={styles.landing}>
            <ReqEmptyState
              description="输入一段产品目标、用户角色或功能想法。对话开始后，Agent、工具过程和产出物会按实际进展逐步出现。"
              title="需要拆解什么需求？"
            >
              <ReqComposer
                hint="shift + enter 换行"
                placeholder="描述产品目标、用户角色、核心功能和约束条件……"
                variant="landing"
              />
            </ReqEmptyState>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <ToolRegistry />
      <ReqAgentWorkbench
        artifactCount={artifactCount}
        artifactPanel={<ArtifactPanel artifacts={artifacts} />}
        artifactsOpen={artifactsOpen}
        currentAgent={currentAgent}
        hasArtifacts={hasArtifacts}
        navHint="当前会话状态完全来自 runtime metadata；多会话列表后续再接。"
        navOpen={navOpen}
        onArtifactsClose={() => setArtifactsOpen(false)}
        onArtifactsToggle={() => {
          setNavOpen(false);
          setArtifactsOpen((value) => !value);
        }}
        onNavClose={() => setNavOpen(false)}
        onNavToggle={() => {
          setArtifactsOpen(false);
          setNavOpen((value) => !value);
        }}
        threadTitle={threadTitle}
      >
        <ReqAgentWorkbenchScene
          artifactsOpen={artifactsOpen}
          composer={
            <ReqComposer
              hint="shift + enter 换行"
              placeholder="继续补充需求、约束或追问方向……"
              variant="thread"
            />
          }
          hasArtifacts={hasArtifacts}
          messages={
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
              }}
            />
          }
          scrollToBottom={
            <ThreadPrimitive.ScrollToBottom behavior="smooth" className={styles.scrollToBottomButton}>
              <ReqScrollToBottom>回到底部</ReqScrollToBottom>
            </ThreadPrimitive.ScrollToBottom>
          }
          thinking={
            thinkingMode ? (
              <ReqThinkingBlock
                agent={currentAgent}
                elapsedLabel={elapsedLabel}
                mode={thinkingMode}
                onToggle={() => setThinkingOpen((value) => !value)}
                open={thinkingOpen}
                phaseLabel={activeStage ? reqAgentStageLabels[activeStage] : undefined}
                summary={thinkingSummary}
              />
            ) : null
          }
        />
      </ReqAgentWorkbench>
    </main>
  );
}

function ToolRegistry() {
  return (
    <>
      <ParseInputToolUI />
      <SearchKnowledgeToolUI />
      <GenerateStoriesToolUI />
      <GenerateDocToolUI />
    </>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className={styles.messageRoot}>
      <ReqMessage role="user">
        <MessagePrimitive.Parts />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={styles.messageRoot}>
      <ReqMessage role="assistant">
        <MessagePrimitive.Parts
          components={{
            tools: {
              by_name: {
                parse_input: ParseInputToolUI,
                search_knowledge: SearchKnowledgeToolUI,
                generate_stories: GenerateStoriesToolUI,
                generate_doc: GenerateDocToolUI,
              },
            },
          }}
        />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}

function getFallbackThreadTitle(messages: readonly MessageLike[]) {
  const firstUserText = messages.find((message) => message.role === "user");
  const text = getMessageText(firstUserText);
  return text ? text.slice(0, 32) : "当前会话";
}

function getMessageText(message?: { parts?: MessagePartLike[] }) {
  return (message?.parts ?? [])
    .filter((part): part is MessagePartLike & { type: "text"; text: string } => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getThinkingSummary(threadState: ReqAgentThreadState | null) {
  if (threadState?.workflowStatus === "failed" && threadState.errorMessage) {
    return threadState.errorMessage;
  }

  if (threadState?.publicThinking && threadState.publicThinking.trim().length > 0) {
    return threadState.publicThinking.trim();
  }

  if (threadState?.activeStage) {
    return `当前阶段：${reqAgentStageLabels[threadState.activeStage]}`;
  }

  return "等待新的需求输入。";
}

function getThinkingMode(workflowStatus: "idle" | "running" | "awaiting_input" | "completed" | "failed") {
  if (workflowStatus === "idle") {
    return null;
  }

  if (workflowStatus === "running") {
    return "running";
  }

  if (workflowStatus === "failed") {
    return "failed";
  }

  return "completed";
}

function formatElapsedLabel(runStartedAt: number | null, runEndedAt: number | null, tick: number) {
  if (runStartedAt == null) {
    return "0.0s";
  }

  return formatDuration((runEndedAt ?? tick) - runStartedAt);
}

function formatDuration(elapsedMs: number) {
  const seconds = Math.max(0, elapsedMs) / 1000;

  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }

  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
