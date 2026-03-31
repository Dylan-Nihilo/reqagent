"use client";

import Link from "next/link";
import {
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
  useMessageTiming,
  useThread,
  useAuiState,
  type MessageStatus,
} from "@assistant-ui/react";
import { useAui } from "@assistant-ui/store";
import { ReqComposer } from "@/components/ReqComposer";
import { ReqMessage } from "@/components/ReqMessage";
import { ReqStreamingIndicator } from "@/components/ReqStreamingIndicator";
import { ReqScrollToBottom } from "@/components/ReqScrollToBottom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReqNavDrawer } from "@/components/ReqNavDrawer";
import { ReqBrandMark } from "@/components/ReqBrandMark";
import {
  ReqArtifactsIcon,
  ReqGalleryIcon,
  ReqSettingsIcon,
  ReqSidebarIcon,
} from "@/components/ReqIcons";
import { ReqModelBadge } from "@/components/ReqModelBadge";
import { ReqSkillLoadedChips } from "@/components/ReqSkillLoadedChips";
import { ReqSkillSelector } from "@/components/ReqSkillSelector";
import { userPartComponents, assistantPartComponents } from "@/lib/part-registry";
import { ReqArtifactsPanel } from "@/components/ReqArtifactsPanel";
import styles from "@/components/ReqAgentShell.module.css";
import {
  hasRenderableMessageOutput,
  inferAgentActivityFromMessageParts,
  summarizeMessageParts,
} from "@/lib/message-parts";
import type { ReqAgentLoadedSkillMeta } from "@/lib/skills/types";
import type { AgentActivity, ReqAgentMessageMeta } from "@/lib/types";
import { useArtifacts } from "@/lib/use-artifacts";
import { useIsMessageCancelled } from "@/lib/cancel-store";
import { resolveInteractiveQaCueSurface } from "@/lib/interactive-qa-surface";

const SUGGESTIONS = [
  "分析电商平台的需求",
  "拆解用户登录模块",
  "生成用户故事",
  "查看工作区文件",
];

const LANDING_NOTES = [
  {
    eyebrow: "Institutional Grade",
    text: "将模糊业务意图压缩成结构化工作稿，适合需求澄清、功能拆解与交付准备。",
  },
  {
    eyebrow: "Semantic Core",
    text: "把对话、工具输出与文档产物放到同一张工作台上，避免在聊天界面和文件系统之间来回切换。",
  },
];

const LANDING_PROTOCOL = [
  "输入目标、范围、约束与交付形式",
  "由 agent 继续补全结构、调用工具、沉淀产物",
  "在同一张工作台上完成整理、修改与导出",
];

const SURFACE_TRANSITION_MS = 560;

type ReqAgentUIProps = {
  workspaceId: string;
};

export function ReqAgentUI({ workspaceId }: ReqAgentUIProps) {
  const messageCount = useThread((s) => s.messages.length);
  const threadMessages = useThread((state) => state.messages);
  const threadIsRunning = useThread((state) => state.isRunning);
  const remoteId = useAuiState((state) => state.threadListItem.remoteId);
  const initialHasThread = messageCount > 0 || Boolean(remoteId);
  const [viewMode, setViewMode] = useState<"landing" | "thread">(
    initialHasThread ? "thread" : "landing",
  );
  const [surfaceMode, setSurfaceMode] = useState<
    "landing" | "transitioning-to-thread" | "thread"
  >(initialHasThread ? "thread" : "landing");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const isThreadSurfaceVisible = surfaceMode !== "landing";
  const isThreadSettled = surfaceMode === "thread";
  const isTransitioningToThread = surfaceMode === "transitioning-to-thread";
  const shouldRenderLanding = surfaceMode !== "thread";
  const shouldRenderThread = viewMode === "thread" || surfaceMode !== "landing";

  useEffect(() => {
    if (messageCount > 0 || remoteId) {
      setViewMode("thread");
    }
  }, [messageCount, remoteId]);

  useEffect(() => {
    if (viewMode === "thread" && surfaceMode === "landing") {
      setShowHistory(false);
      setShowSettings(false);
      setSurfaceMode("transitioning-to-thread");
    }
  }, [surfaceMode, viewMode]);

  useEffect(() => {
    if (surfaceMode !== "transitioning-to-thread") {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSurfaceMode("thread");
      return;
    }

    const timer = window.setTimeout(() => {
      setSurfaceMode("thread");
    }, SURFACE_TRANSITION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [surfaceMode]);

  useEffect(() => {
    if (isThreadSurfaceVisible) {
      setShowHistory(false);
    }
  }, [isThreadSurfaceVisible]);

  const handleEnterThread = useCallback(() => {
    setViewMode("thread");
  }, []);

  const [artifactsCollapsed, setArtifactsCollapsed] = useState(false);
  const artifacts = useArtifacts(workspaceId);
  const hasArtifacts = artifacts.items.length > 0 || Boolean(artifacts.pending);
  const showArtifactsPanel = hasArtifacts && !artifactsCollapsed;
  const artifactCount = artifacts.items.length + (artifacts.pending ? 1 : 0);
  const workspaceCode = workspaceId.replace(/^ws_/, "").slice(0, 8).toUpperCase();
  const lastAutoRevealTokenRef = useRef<string | null>(null);
  const clarificationCue = useMemo(() => {
    for (let index = threadMessages.length - 1; index >= 0; index -= 1) {
      const message = threadMessages[index];
      if (message?.role !== "assistant") continue;

      const metaObj = message.metadata as Record<string, unknown> | undefined;
      const meta = metaObj?.custom as ReqAgentMessageMeta | undefined;
      const cue = resolveInteractiveQaCueSurface(
        {
          content: message.content,
        },
        meta,
      );
      if (!cue) return null;

      const trailingMessages = threadMessages.slice(index + 1);
      if (trailingMessages.some((candidate) => candidate.role === "assistant")) {
        return null;
      }

      if (trailingMessages.every((candidate) => candidate.role === "user")) {
        return cue;
      }

      return threadIsRunning ? cue : null;
    }

    return null;
  }, [threadIsRunning, threadMessages]);

  const latestWriteFileToken = artifacts.pending?.toolName === "writeFile"
    ? `pending:${artifacts.pending.id}`
    : artifacts.items[0]?.toolName === "writeFile"
      ? `item:${artifacts.items[0].id}`
      : null;

  useEffect(() => {
    if (!hasArtifacts) {
      setArtifactsCollapsed(false);
    }
  }, [hasArtifacts]);

  useEffect(() => {
    if (!latestWriteFileToken) return;
    if (latestWriteFileToken === lastAutoRevealTokenRef.current) return;

    setArtifactsCollapsed(false);
    lastAutoRevealTokenRef.current = latestWriteFileToken;
  }, [latestWriteFileToken]);

  return (
    <div
      className={[
        styles.shell,
        isThreadSurfaceVisible ? styles.shellThread : "",
        isThreadSurfaceVisible && showArtifactsPanel ? styles.shellWithPanel : "",
        isThreadSurfaceVisible && sidebarCollapsed ? styles.shellSidebarCollapsed : "",
      ].join(" ").trim()}
    >
      <div
        className={[
          styles.surfaceStack,
          isTransitioningToThread ? styles.surfaceStackTransitioning : "",
        ].join(" ").trim()}
      >
        {shouldRenderLanding ? (
          <div
            className={[
              styles.surfaceLayer,
              styles.surfaceLayerLanding,
              !isTransitioningToThread ? styles.surfaceLayerActive : "",
              isTransitioningToThread ? styles.surfaceLayerLandingExit : "",
            ].join(" ").trim()}
          >
            <div className={styles.landingStage}>
              <div className={styles.landingWorkbench}>
                <aside className={styles.landingRail}>
                  <div className={styles.landingRailHead}>
                    <Link className={styles.logo} href="/">
                      <div className={styles.logoMark}>
                        <ReqBrandMark className={styles.logoMarkSvg} />
                      </div>
                      <span className={styles.logoText}>ReqAgent</span>
                    </Link>
                    <p className={styles.kicker}>Prepared Desk 01</p>
                  </div>

                  <div className={styles.landingRailSection}>
                    <p className={styles.sectionEyebrow}>Workspace</p>
                    <button className={[styles.navLink, styles.navLinkActive].join(" ").trim()} type="button">
                      当前工作台
                    </button>
                    <button
                      className={styles.navLink}
                      onClick={() => {
                        setShowSettings(false);
                        setShowHistory(true);
                      }}
                      type="button"
                    >
                      历史对话
                    </button>
                    <Link className={styles.navLink} href="/gallery">
                      组件预览
                    </Link>
                    <button
                      className={styles.navLink}
                      onClick={() => {
                        setShowHistory(false);
                        setShowSettings(true);
                      }}
                      type="button"
                    >
                      工作区设置
                    </button>
                  </div>

                  <div className={styles.landingRailSection}>
                    <p className={styles.sectionEyebrow}>Capabilities</p>
                    <div className={styles.capabilityRow}>
                      <span className={styles.capabilityIndex}>01</span>
                      <span>需求分析</span>
                    </div>
                    <div className={styles.capabilityRow}>
                      <span className={styles.capabilityIndex}>02</span>
                      <span>文档解析</span>
                    </div>
                    <div className={styles.capabilityRow}>
                      <span className={styles.capabilityIndex}>03</span>
                      <span>模板导出</span>
                    </div>
                  </div>

                  <div className={styles.landingProfile}>
                    <span className={styles.profileMonogram}>D</span>
                    <div className={styles.profileMeta}>
                      <p className={styles.profileName}>Dylan Workspace</p>
                      <p className={styles.profileHint}>v0.1.0 · system ready</p>
                    </div>
                  </div>
                </aside>

                <section className={styles.landingCanvas}>
                  <div className={styles.canvasBar}>
                    <span className={styles.canvasTab}>Overview</span>
                    <span className={[styles.canvasTab, styles.canvasTabActive].join(" ").trim()}>
                      Analysis Surface
                    </span>
                  </div>

                  <div className={styles.landingContent}>
                    <div className={styles.landingMainColumn}>
                      <div className={styles.heroBlock}>
                        <p className={styles.heroEyebrow}>Editorial Workbench</p>
                        <h1 className={styles.title}>从需求到文档，精确如你所想。</h1>
                        <p className={styles.subtitle}>
                          ReqAgent 是一个 AI 驱动的需求分析工作台。描述你的业务需求、流程约束或文档模板，把它整理成可继续推进的工作稿。
                        </p>
                      </div>

                      <div className={styles.composerLanding}>
                        <ReqComposer
                          hint="enter 发送"
                          placeholder="描述你的需求、流程、模板或业务约束。"
                          submitLabel="开始分析"
                          variant="landing"
                          workspaceId={workspaceId}
                        />
                      </div>

                      <ReqSuggestionChips />
                    </div>
                  </div>

                  <div className={styles.landingLowerBand}>
                    {LANDING_NOTES.map((note) => (
                      <div className={styles.noteBlock} key={note.eyebrow}>
                        <p className={styles.noteEyebrow}>{note.eyebrow}</p>
                        <p className={styles.noteText}>{note.text}</p>
                      </div>
                    ))}

                    <div className={[styles.noteBlock, styles.protocolBlock].join(" ").trim()}>
                      <p className={styles.noteEyebrow}>Working Method</p>
                      <div className={styles.protocolList}>
                        {LANDING_PROTOCOL.map((item, index) => (
                          <div className={styles.protocolItem} key={item}>
                            <span className={styles.protocolIndex}>{String(index + 1).padStart(2, "0")}</span>
                            <span className={styles.protocolText}>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <div
              className={[
                styles.landingOverlay,
                showHistory ? styles.landingOverlayOpen : "",
              ].join(" ").trim()}
            >
              <div className={styles.landingSidebar}>
                <ReqNavDrawer
                  collapsed={false}
                  currentAgent="ReqAgent"
                  hint="选择历史对话继续"
                  onNewThread={handleEnterThread}
                  onSwitchThread={handleEnterThread}
                  threadTitle="新对话"
                  workspaceId={workspaceId}
                />
              </div>
              <div
                className={styles.landingBackdrop}
                onClick={() => setShowHistory(false)}
                role="presentation"
              />
            </div>
          </div>
        ) : null}

        {shouldRenderThread ? (
          <div
            className={[
              styles.surfaceLayer,
              styles.surfaceLayerThread,
              isTransitioningToThread ? styles.surfaceLayerThreadEnter : "",
              isThreadSettled ? styles.surfaceLayerActive : "",
            ].join(" ").trim()}
          >
            <div className={styles.threadWrap}>
              <div className={styles.threadFrame}>
                <div className={styles.threadTopbar}>
                  <div className={styles.topBarInner}>
                    <div className={styles.topBarGroup}>
                      <Link className={styles.topBarBrand} href="/">
                        <div className={styles.logoMark}>
                          <ReqBrandMark className={styles.logoMarkSvg} />
                        </div>
                        <span className={styles.logoText}>ReqAgent</span>
                      </Link>
                      <button
                        className={styles.ghostBtn}
                        onClick={() => setSidebarCollapsed((v) => !v)}
                        type="button"
                        aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
                      >
                        <ReqSidebarIcon className={styles.ghostBtnIcon} />
                        <span className={styles.ghostBtnLabel}>
                          {sidebarCollapsed ? "展开目录" : "收起目录"}
                        </span>
                      </button>
                    </div>

                    <div className={styles.topBarGroup}>
                      <div className={styles.topBarWorkspace}>
                        <span className={styles.canvasLedgerPill}>workspace</span>
                        <code className={styles.canvasLedgerCode}>{workspaceCode}</code>
                      </div>
                      <button
                        className={[
                          styles.ghostBtn,
                          !hasArtifacts ? styles.ghostBtnMuted : "",
                        ].join(" ").trim()}
                        disabled={!hasArtifacts}
                        onClick={() => setArtifactsCollapsed((v) => !v)}
                        type="button"
                      >
                        <ReqArtifactsIcon className={styles.ghostBtnIcon} />
                        <span className={styles.ghostBtnLabel}>
                          产物{hasArtifacts ? ` ${artifactCount}` : ""}
                        </span>
                      </button>
                      <Link className={styles.ghostBtn} href="/gallery">
                        <ReqGalleryIcon className={styles.ghostBtnIcon} />
                        <span className={styles.ghostBtnLabel}>组件预览</span>
                      </Link>
                      <button
                        className={styles.ghostBtn}
                        onClick={() => setShowSettings(true)}
                        type="button"
                      >
                        <ReqSettingsIcon className={styles.ghostBtnIcon} />
                        <span className={styles.ghostBtnLabel}>设置</span>
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
                      onNewThread={handleEnterThread}
                      onToggle={() => setSidebarCollapsed((v) => !v)}
                      onSwitchThread={handleEnterThread}
                      threadTitle="当前会话"
                      workspaceId={workspaceId}
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
                          <ThreadPrimitive.ViewportFooter
                            className={[
                              styles.viewportFooter,
                              clarificationCue ? styles.viewportFooterQaMode : "",
                            ].join(" ").trim()}
                          >
                            <div className={styles.viewportFooterInner}>
                              <ThreadPrimitive.ScrollToBottom
                                behavior="smooth"
                                className={styles.scrollToBottomButton}
                              >
                                <ReqScrollToBottom>回到底部</ReqScrollToBottom>
                              </ThreadPrimitive.ScrollToBottom>
                              {clarificationCue ? null : (
                                <div className={styles.composerDock}>
                                  <ReqComposer
                                    hint="enter 发送"
                                    placeholder="继续推进这个需求。"
                                    submitLabel="继续"
                                    variant="thread"
                                    workspaceId={workspaceId}
                                  />
                                </div>
                              )}
                            </div>
                          </ThreadPrimitive.ViewportFooter>
                        </ThreadPrimitive.Viewport>
                      </ThreadPrimitive.Root>
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
            </div>
          </div>
        ) : null}
      </div>

      <SettingsSheet
        onClose={() => setShowSettings(false)}
        open={showSettings}
        workspaceId={workspaceId}
      />
    </div>
  );
}

function ReqSuggestionChips() {
  const aui = useAui();
  return (
    <div className={styles.suggestions}>
      {SUGGESTIONS.map((s) => (
        <button
          className={styles.chip}
          key={s}
          onClick={() => aui.composer().setText(s)}
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
        <MessagePrimitive.Parts components={userPartComponents} />
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
  const loadedSkills = meta?.debug?.loadedSkills ?? [];

  return (
    <MessagePrimitive.Root>
      <ReqMessage
        meta={
          meta?.model ? (
            <ReqModelBadge
              model={meta.model}
              providerName={meta.providerName}
              wireApi={meta.wireApi}
            />
          ) : undefined
        }
        role="assistant"
        signals={buildAssistantSignals({ timing })}
        status={visualStatus}
      >
        <ReqSkillLoadedChips skills={loadedSkills} />
        {visualStatus === "pending" ? (
          <ReqStreamingIndicator
            label={pendingCopy.label}
            phases={pendingCopy.phases}
          />
        ) : null}
        <MessagePrimitive.Parts components={assistantPartComponents} />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}

export function AssistantDebugPanel({
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

// ---------------------------------------------------------------------------
// Settings sheet (slide-out panel with skill selector)
// ---------------------------------------------------------------------------

function SettingsSheet({
  onClose,
  open,
  workspaceId,
}: {
  onClose: () => void;
  open: boolean;
  workspaceId: string;
}) {
  return (
    <div
      className={[
        styles.settingsOverlay,
        open ? styles.settingsOverlayOpen : "",
      ].join(" ").trim()}
    >
      <div
        className={styles.settingsBackdrop}
        onClick={onClose}
        role="presentation"
      />
      <aside className={styles.settingsPanel}>
        <div className={styles.settingsPanelHead}>
          <div className={styles.settingsPanelCopy}>
            <p className={styles.settingsEyebrow}>Workspace Settings</p>
            <h2 className={styles.settingsTitle}>Skill 配置</h2>
            <p className={styles.settingsLead}>
              当前所有可用 skill 会自动加载到每次对话中。
            </p>
          </div>
          <button
            className={styles.settingsClose}
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>

        <div className={styles.settingsMeta}>
          <span className={styles.settingsPill}>workspace</span>
          <code className={styles.settingsCode}>{workspaceId}</code>
        </div>

        <div className={styles.settingsSection}>
          <ReqSkillSelector workspaceId={workspaceId} />
        </div>

        <div className={styles.settingsFootnote}>
          <ReqSkillLoadedChips skills={sampleLoadedSkills} />
          <p className={styles.settingsHint}>
            loaded chips 会贴在 assistant turn 顶部，标示当前对话已加载的 skill。
          </p>
        </div>
      </aside>
    </div>
  );
}

const sampleLoadedSkills: ReqAgentLoadedSkillMeta[] = [
  { id: "req-prd-generic", name: "通用 PRD 模板", type: "knowledge" },
  { id: "cap-mermaid", name: "Mermaid 图表", type: "capability" },
];
