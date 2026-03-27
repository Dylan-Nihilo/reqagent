"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAui } from "@assistant-ui/store";
import { useAuiState } from "@assistant-ui/store";
import { useThread } from "@assistant-ui/react";
import { ReqBrandMark } from "@/components/ReqBrandMark";
import { ReqChatIcon, ReqPlusIcon, ReqTrashIcon } from "@/components/ReqIcons";
import styles from "@/components/ReqNavDrawer.module.css";
import { DEFAULT_THREAD_TITLE, type ReqAgentThreadRecord } from "@/lib/threads";

type ReqNavDrawerProps = {
  threadTitle: string;
  currentAgent: string;
  hint: string;
  workspaceId?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  onNewThread?: () => void;
  onSwitchThread?: () => void;
};

type ThreadGroup = {
  label: string;
  items: ReqAgentThreadRecord[];
};

function getThreadGroups(threads: ReqAgentThreadRecord[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  const buckets: ThreadGroup[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "更早", items: [] },
  ];

  threads.forEach((thread) => {
    if (thread.updatedAt >= startOfToday) {
      buckets[0]!.items.push(thread);
      return;
    }

    if (thread.updatedAt >= startOfYesterday) {
      buckets[1]!.items.push(thread);
      return;
    }

    buckets[2]!.items.push(thread);
  });

  return buckets.filter((bucket) => bucket.items.length > 0);
}

function formatThreadMeta(updatedAt: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(updatedAt));
}

async function fetchThreads(workspaceId: string) {
  const response = await fetch(
    `/api/threads?workspaceId=${encodeURIComponent(workspaceId)}&includeArchived=0`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Failed to load threads: ${response.status}`);
  }

  const data = (await response.json()) as {
    threads: ReqAgentThreadRecord[];
  };

  return data.threads.filter((thread) => !thread.isArchived);
}

function ReqNavDrawerRuntime({
  currentAgent,
  hint,
  workspaceId,
  collapsed = false,
  onNewThread,
  onSwitchThread,
}: ReqNavDrawerProps & { workspaceId: string }) {
  const aui = useAui();
  const [threads, setThreads] = useState<ReqAgentThreadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const activeRemoteId = useAuiState((state) => state.threadListItem.remoteId);
  const activeTitle = useAuiState((state) => state.threadListItem.title);
  const messageCount = useThread((state) => state.messages.length);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      setThreads(await fetchThreads(workspaceId));
    } catch (error) {
      console.error("Failed to load thread list", error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads, messageCount, activeRemoteId]);

  const groups = useMemo(() => getThreadGroups(threads), [threads]);
  const showDraftThread = !activeRemoteId && messageCount > 0;
  const resolvedThreadTitle = activeRemoteId
    ? (activeTitle ?? DEFAULT_THREAD_TITLE)
    : DEFAULT_THREAD_TITLE;

  const handleNewThread = useCallback(async () => {
    await aui.threads().switchToNewThread();
    onNewThread?.();
  }, [aui, onNewThread]);

  const handleSwitchThread = useCallback(
    async (id: string) => {
      await aui.threads().switchToThread(id);
      onSwitchThread?.();
      void loadThreads();
    },
    [aui, loadThreads, onSwitchThread],
  );

  const handleDeleteThread = useCallback(
    async (id: string) => {
      await aui.threads().item({ id }).delete();
      void loadThreads();
    },
    [aui, loadThreads],
  );

  return (
    <aside
      aria-label="会话侧栏"
      className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ""].join(" ").trim()}
    >
      <div className={styles.primaryActions}>
        <button className={styles.primaryButton} onClick={() => void handleNewThread()} type="button">
          <span className={styles.primaryIcon} aria-hidden="true"><ReqPlusIcon /></span>
          <span className={styles.primaryLabel}>新建对话</span>
        </button>
      </div>

      <div className={styles.section}>
        {showDraftThread ? (
          <div className={styles.group}>
            {!collapsed ? <p className={styles.groupLabel}>当前草稿</p> : null}
            <button className={[styles.threadRow, styles.active].join(" ")} type="button">
              {collapsed ? (
                <ReqChatIcon className={styles.threadIcon} />
              ) : (
                <>
                  <span className={styles.threadAccent} aria-hidden="true" />
                  <span className={styles.threadBody}>
                    <span className={styles.threadTitle}>{resolvedThreadTitle}</span>
                    <span className={styles.threadMeta}>尚未保存</span>
                  </span>
                </>
              )}
            </button>
          </div>
        ) : null}

        {groups.map((group) => (
          <div className={styles.group} key={group.label}>
            {!collapsed ? <p className={styles.groupLabel}>{group.label}</p> : null}
            {group.items.map((thread) => {
              const isActive = activeRemoteId === thread.id;
              return (
                <div className={styles.threadItem} key={thread.id}>
                  <button
                    className={[styles.threadRow, isActive ? styles.active : ""].join(" ").trim()}
                    onClick={() => void handleSwitchThread(thread.id)}
                    type="button"
                  >
                    {collapsed ? (
                      <ReqChatIcon className={styles.threadIcon} />
                    ) : (
                      <>
                        <span className={styles.threadAccent} aria-hidden="true" />
                        <span className={styles.threadBody}>
                          <span className={styles.threadTitle}>{thread.title}</span>
                          <span className={styles.threadMeta}>{formatThreadMeta(thread.updatedAt)}</span>
                        </span>
                      </>
                    )}
                  </button>
                  {!collapsed ? (
                    <button
                      aria-label={`归档 ${thread.title}`}
                      className={styles.threadDelete}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteThread(thread.id);
                      }}
                      type="button"
                    >
                      <ReqTrashIcon />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}

        {!loading && groups.length === 0 && !showDraftThread ? (
          <p className={styles.emptyState}>暂无历史对话</p>
        ) : null}
      </div>

      <div className={styles.bottom}>
        {!collapsed ? (
          <>
            <p className={styles.agentLabel}>当前 Agent</p>
            <div className={styles.agentCard}>
              <span className={styles.agentMonogram}>
                <ReqBrandMark className={styles.agentGlyph} />
              </span>
              <div className={styles.agentCopy}>
                <p className={styles.agentName}>{currentAgent}</p>
                <p className={styles.agentHint}>{hint}</p>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.agentMini} title={currentAgent}>
            <ReqBrandMark className={styles.agentGlyph} />
          </div>
        )}
      </div>
    </aside>
  );
}

function ReqNavDrawerStatic({
  threadTitle,
  currentAgent,
  hint,
  collapsed = false,
}: ReqNavDrawerProps) {
  return (
    <aside
      aria-label="会话侧栏"
      className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ""].join(" ").trim()}
    >
      <div className={styles.primaryActions}>
        <button className={styles.primaryButton} type="button">
          <span className={styles.primaryIcon} aria-hidden="true"><ReqPlusIcon /></span>
          <span className={styles.primaryLabel}>新建对话</span>
        </button>
      </div>

      <div className={styles.section}>
        {!collapsed ? <p className={styles.sectionLabel}>当前会话</p> : null}
        <button className={styles.threadRow} type="button">
          {collapsed ? (
            <ReqChatIcon className={styles.threadIcon} />
          ) : (
            <>
              <span className={styles.threadAccent} aria-hidden="true" />
              <span className={styles.threadBody}>
                <span className={styles.threadTitle}>{threadTitle}</span>
                <span className={styles.threadMeta}>agent · {currentAgent}</span>
              </span>
            </>
          )}
        </button>
      </div>

      <div className={styles.bottom}>
        {!collapsed ? (
          <>
            <p className={styles.agentLabel}>当前 Agent</p>
            <div className={styles.agentCard}>
              <span className={styles.agentMonogram}>
                <ReqBrandMark className={styles.agentGlyph} />
              </span>
              <div className={styles.agentCopy}>
                <p className={styles.agentName}>{currentAgent}</p>
                <p className={styles.agentHint}>{hint}</p>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.agentMini} title={currentAgent}>
            <ReqBrandMark className={styles.agentGlyph} />
          </div>
        )}
      </div>
    </aside>
  );
}

export function ReqNavDrawer({
  threadTitle,
  currentAgent,
  hint,
  workspaceId,
  collapsed = false,
  onNewThread,
  onSwitchThread,
}: ReqNavDrawerProps) {
  if (workspaceId) {
    return (
      <ReqNavDrawerRuntime
        collapsed={collapsed}
        currentAgent={currentAgent}
        hint={hint}
        onNewThread={onNewThread}
        onSwitchThread={onSwitchThread}
        threadTitle={threadTitle}
        workspaceId={workspaceId}
      />
    );
  }

  return <ReqNavDrawerStatic collapsed={collapsed} currentAgent={currentAgent} hint={hint} threadTitle={threadTitle} />;
}
