"use client";

import {
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
  useMessageTiming,
  useThread,
  useComposerRuntime,
  type MessageStatus,
} from "@assistant-ui/react";
import { ReqComposer } from "@/components/ReqComposer";
import { ReqFilePart } from "@/components/ReqFilePart";
import { ReqImagePart } from "@/components/ReqImagePart";
import { ReqMessage } from "@/components/ReqMessage";
import { ReqReasoningPart } from "@/components/ReqReasoningPart";
import { ReqSourcePart } from "@/components/ReqSourcePart";
import { ReqStreamingIndicator } from "@/components/ReqStreamingIndicator";
import { ReqTextPart } from "@/components/ReqTextPart";
import { ReqScrollToBottom } from "@/components/ReqScrollToBottom";
import { useEffect, useState } from "react";
import { ReqToolCallPart } from "@/components/ReqToolCallPart";
import { ReqNavDrawer } from "@/components/ReqNavDrawer";
import { ReqArtifactsPanel } from "@/components/ReqArtifactsPanel";
import styles from "@/components/ReqAgentShell.module.css";
import {
  hasRenderableMessageOutput,
  inferAgentActivityFromMessageParts,
  summarizeMessageParts,
} from "@/lib/message-parts";
import type { AgentActivity, ReqAgentMessageMeta } from "@/lib/types";
import { useArtifacts } from "@/lib/use-artifacts";
import { useIsMessageCancelled } from "@/lib/cancel-store";

const SUGGESTIONS = [
  "分析电商平台的需求",
  "拆解用户登录模块",
  "生成用户故事",
  "查看工作区文件",
];

export function ReqAgentUI() {
  const isEmpty = useThread((s) => s.messages.length === 0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [artifactsCollapsed, setArtifactsCollapsed] = useState(false);
  const artifacts = useArtifacts();
  const hasArtifacts = artifacts.items.length > 0 || Boolean(artifacts.pending);
  const showArtifactsPanel = hasArtifacts && !artifactsCollapsed;
  const artifactCount = artifacts.items.length + (artifacts.pending ? 1 : 0);

  useEffect(() => {
    if (!hasArtifacts) {
      setArtifactsCollapsed(false);
    }
  }, [hasArtifacts]);

  return (
    <div
      className={[
        styles.shell,
        isEmpty ? "" : styles.shellThread,
        !isEmpty && showArtifactsPanel ? styles.shellWithPanel : "",
        !isEmpty && sidebarCollapsed ? styles.shellSidebarCollapsed : "",
      ].join(" ").trim()}
    >
      {isEmpty ? (
        <>
          <div className={styles.cornerTL}>
            <a className={styles.logo} href="/">
              <div className={styles.logoMark}>
                <ReqLogoSvg />
              </div>
              <span className={styles.logoText}>ReqAgent</span>
            </a>
          </div>

          <div className={styles.cornerTR}>
            <a className={styles.ghostBtn} href="/gallery">
              <GalleryIcon className={styles.ghostBtnIcon} />
              Gallery
            </a>
            <button className={styles.ghostBtn} type="button">
              <SettingsIcon className={styles.ghostBtnIcon} />
              设置
            </button>
          </div>

          <div className={styles.cornerBL}>
            <span className={styles.statusDot} />
            <span className={styles.versionTag}>系统正常</span>
          </div>

          <div className={styles.cornerBR}>
            <span className={styles.versionTag}>v0.1.0</span>
          </div>

          <div className={styles.landingStage}>
            <div className={styles.landingCenter}>
              <div className={styles.titleBlock}>
                <h1 className={styles.title}>ReqAgent</h1>
                <p className={styles.subtitle}>
                  把模糊的想法变成可执行的需求
                </p>
              </div>

              <div className={styles.composerLanding}>
                <ReqComposer
                  hint="shift + enter 换行"
                  placeholder="描述产品、功能或流程，把需求交给 ReqAgent……"
                  variant="landing"
                />
              </div>

              <ReqSuggestionChips />
              <div className={styles.landingRule} />
            </div>
          </div>
        </>
      ) : (
        <div className={styles.threadWrap}>
          <div className={styles.threadTopbar}>
            <div className={styles.topBarInner}>
              <div className={styles.topBarGroup}>
                <a className={styles.topBarBrand} href="/">
                  <div className={styles.logoMark}>ReqAgent</div>
                </a>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  type="button"
                  aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
                >
                  <SessionIcon className={styles.ghostBtnIcon} />
                </button>
              </div>

              <div className={styles.topBarGroup}>
                <button
                  className={[
                    styles.ghostBtn,
                    !hasArtifacts ? styles.ghostBtnMuted : "",
                  ].join(" ").trim()}
                  disabled={!hasArtifacts}
                  onClick={() => setArtifactsCollapsed((v) => !v)}
                  type="button"
                >
                  <ArtifactIcon className={styles.ghostBtnIcon} />
                  产物{hasArtifacts ? ` ${artifactCount}` : ""}
                </button>
                <a className={styles.ghostBtn} href="/gallery">
                  <GalleryIcon className={styles.ghostBtnIcon} />
                  Gallery
                </a>
                <button className={styles.ghostBtn} type="button">
                  <SettingsIcon className={styles.ghostBtnIcon} />
                  设置
                </button>
              </div>
            </div>
          </div>

          <div className={styles.threadLayout}>
            <aside className={styles.sidebarColumn}>
              <ReqNavDrawer
                collapsed={sidebarCollapsed}
                currentAgent="ReqAgent"
                hint="输入新消息开始对话"
                onToggle={() => setSidebarCollapsed((v) => !v)}
                threadTitle="当前会话"
              />
            </aside>
            <div className={styles.threadMain}>
              <div className={styles.threadMainInner}>
                <ThreadPrimitive.Root className={styles.threadRoot}>
                  <ThreadPrimitive.Viewport
                    autoScroll
                    className={styles.viewport}
                    scrollToBottomOnInitialize
                    scrollToBottomOnRunStart
                    turnAnchor="bottom"
                  >
                    <div className={styles.threadContent}>
                      <ThreadPrimitive.Messages
                        components={{
                          UserMessage,
                          AssistantMessage,
                        }}
                      />
                    </div>
                  </ThreadPrimitive.Viewport>
                </ThreadPrimitive.Root>
                <div className={styles.threadFooter}>
                  <ThreadPrimitive.ScrollToBottom
                    behavior="smooth"
                    className={styles.scrollToBottomButton}
                  >
                    <ReqScrollToBottom>回到底部</ReqScrollToBottom>
                  </ThreadPrimitive.ScrollToBottom>
                  <div className={styles.composerDock}>
                    <ReqComposer
                      hint="shift + enter 换行"
                      placeholder="继续推进这个需求……"
                      variant="thread"
                    />
                  </div>
                </div>
              </div>
            </div>

            <aside
              className={[
                styles.artifactsPanel,
                showArtifactsPanel ? styles.artifactsPanelVisible : "",
              ].join(" ").trim()}
            >
              <ReqArtifactsPanel
                items={artifacts.items}
                onClose={() => setArtifactsCollapsed(true)}
                pending={artifacts.pending}
              />
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

function ReqSuggestionChips() {
  const composer = useComposerRuntime();
  return (
    <div className={styles.suggestions}>
      {SUGGESTIONS.map((s) => (
        <button
          className={styles.chip}
          key={s}
          onClick={() => composer.setText(s)}
          type="button"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message components
// ---------------------------------------------------------------------------

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <ReqMessage role="user" status="complete">
        <MessagePrimitive.Parts
          components={{
            Text: ReqTextPart,
            File: ReqFilePart,
            Image: ReqImagePart,
          }}
        />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const status = useMessage((s) => s.status as MessageStatus);
  const content = useMessage((s) => s.content);
  const messageId = useMessage((s) => s.id);
  const rawMetadata = useMessage((s) => s.metadata);
  const timing = useMessageTiming();
  const isCancelled = useIsMessageCancelled(messageId);

  const metaObj = rawMetadata as Record<string, unknown> | undefined;
  const meta = metaObj?.custom as ReqAgentMessageMeta | undefined;
  const rawVisualStatus = resolveMessageVisualStatus(status, content);
  const visualStatus = isCancelled && rawVisualStatus === "complete" ? "cancelled" as const : rawVisualStatus;
  const pendingCopy = resolvePendingCopy(meta, content);

  return (
    <MessagePrimitive.Root>
      <ReqMessage
        meta={meta?.model}
        role="assistant"
        signals={buildAssistantSignals({ timing })}
        status={visualStatus}
      >
        {visualStatus === "pending" ? (
          <ReqStreamingIndicator
            label={pendingCopy.label}
            phases={pendingCopy.phases}
          />
        ) : null}
        <MessagePrimitive.Parts
          components={{
            Text: ReqTextPart,
            Reasoning: ReqReasoningPart,
            Source: ReqSourcePart,
            File: ReqFilePart,
            Image: ReqImagePart,
            tools: {
              Fallback: ReqToolCallPart,
            },
          }}
        />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}

function AssistantDebugPanel({
  content,
  metadata,
  status,
  visualStatus,
}: {
  content: unknown;
  metadata?: ReqAgentMessageMeta;
  status: { type: string; reason?: string } | undefined;
  visualStatus: "pending" | "streaming" | "complete" | "failed" | "cancelled";
}) {
  const summary = {
    visualStatus,
    status,
    messageParts: summarizeMessageParts(content),
    metadata,
  };

  return (
    <details className={styles.debugPanel}>
      <summary className={styles.debugSummary}>
        <span>Debug</span>
        <span className={styles.debugSummaryMeta}>
          {metadata?.model ?? "unknown-model"} · {metadata?.wireApi ?? "unknown-wire"}
        </span>
      </summary>
      <pre className={styles.debugPre}>{JSON.stringify(summary, null, 2)}</pre>
    </details>
  );
}

function resolveMessageVisualStatus(
  status: { type: string; reason?: string } | undefined,
  content: unknown,
) {
  if (!status) return "complete" as const;
  if (status.type === "running") {
    return hasRenderableMessageOutput(content) ? "streaming" : "pending";
  }
  if (status.type === "incomplete") return status.reason === "cancelled" ? "cancelled" : "failed";
  return "complete" as const;
}

function inferAgentActivity(content: unknown): AgentActivity | undefined {
  return inferAgentActivityFromMessageParts(content);
}

function resolvePendingCopy(
  metadata: ReqAgentMessageMeta | undefined,
  content: unknown,
) {
  const activity = metadata?.agentActivity ?? inferAgentActivity(content);

  switch (activity) {
    case "thinking":
      return {
        label: "ReqAgent 正在整理回答",
        phases: ["理解问题", "梳理重点", "组织回答"],
      };
    case "tool_calling":
      return {
        label: "ReqAgent 正在补充信息",
        phases: ["查找信息", "整理重点", "继续回答"],
      };
    case "reading":
      return {
        label: "ReqAgent 正在查看上下文",
        phases: ["查看消息", "提取线索", "准备回答"],
      };
    case "searching":
      return {
        label: "ReqAgent 正在查找资料",
        phases: ["查找资料", "筛选内容", "整理结论"],
      };
    case "handoff":
      return {
        label: "ReqAgent 正在继续处理",
        phases: ["安排步骤", "同步内容", "继续回答"],
      };
    case "responding":
      return {
        label: "ReqAgent 正在回答",
        phases: ["整理线索", "组织结构", "写入回答"],
      };
    default:
      return {
        label: "ReqAgent 正在整理回答",
        phases: ["理解问题", "整理线索", "准备回答"],
      };
  }
}

function buildAssistantSignals({
  timing,
}: {
  timing?: ReturnType<typeof useMessageTiming>;
}) {
  const signals: string[] = [];
  if (timing?.totalStreamTime) signals.push(`${(timing.totalStreamTime / 1000).toFixed(1)}s`);
  return signals.length > 0 ? signals : undefined;
}

// SVG assets
function ReqLogoSvg() {
  return (
    <svg fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
      <rect fill="white" height="14" rx="1" width="2.5" x="3" y="2" />
      <path d="M5.5 2h4a3.5 3.5 0 0 1 0 7h-4" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <path d="M7.5 9l4.5 7" fill="none" stroke="white" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

function SessionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <path d="M2 4h12M2 8h8M2 12h10" strokeLinecap="round" />
    </svg>
  );
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <rect height="5" rx="1" width="5" x="1.5" y="1.5" />
      <rect height="5" rx="1" width="5" x="9.5" y="1.5" />
      <rect height="5" rx="1" width="5" x="1.5" y="9.5" />
      <rect height="5" rx="1" width="5" x="9.5" y="9.5" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  );
}

function ArtifactIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <path d="M3 3.5h10M3 8h10M3 12.5h6" strokeLinecap="round" />
      <path d="M11.5 10.5 14 13l-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
