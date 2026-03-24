"use client";

import styles from "@/components/ReqNavDrawer.module.css";

type ReqNavDrawerProps = {
  threadTitle: string;
  currentAgent: string;
  hint: string;
  collapsed?: boolean;
  onToggle?: () => void;
};

function CollapseExpandIcon({ expanded = false }: { expanded?: boolean }) {
  // expanded=true means sidebar is open → show left arrow (to collapse)
  // expanded=false means sidebar is collapsed → show right arrow (to expand)
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
      style={{ transition: "transform 280ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      <path d={expanded ? "M10 4L6 8l4 4" : "M6 4l4 4-4 4"} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 2v10M2 7h10" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h12v8H9l-3 3v-3H2z" />
    </svg>
  );
}

export function ReqNavDrawer({
  threadTitle,
  currentAgent,
  hint,
  collapsed = false,
  onToggle,
}: ReqNavDrawerProps) {
  return (
    <aside
      aria-label="会话侧栏"
      className={[styles.sidebar, collapsed ? styles.sidebarCollapsed : ""].join(" ").trim()}
    >
      <div className={styles.primaryActions}>
        <button className={styles.primaryButton} type="button">
          <span className={styles.primaryIcon} aria-hidden="true"><PlusIcon /></span>
          <span className={styles.primaryLabel}>新建对话</span>
        </button>
      </div>

      <div className={styles.section}>
        {!collapsed ? <p className={styles.sectionLabel}>当前会话</p> : null}
        <button className={styles.threadRow} type="button">
          {collapsed ? (
            <ChatIcon className={styles.threadIcon} />
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
              <span className={styles.agentMonogram}>R</span>
              <div className={styles.agentCopy}>
                <p className={styles.agentName}>{currentAgent}</p>
                <p className={styles.agentHint}>{hint}</p>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.agentMini} title={currentAgent}>
            R
          </div>
        )}
      </div>
    </aside>
  );
}
