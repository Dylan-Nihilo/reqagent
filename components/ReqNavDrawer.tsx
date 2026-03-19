"use client";

import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqNavDrawerProps = {
  threadTitle: string;
  currentAgent: string;
  hint: string;
  onClose?: () => void;
};

export function ReqNavDrawer({ threadTitle, currentAgent, hint, onClose }: ReqNavDrawerProps) {
  return (
    <aside className={styles.drawer}>
      <div className={styles.drawerHead}>
        <span className={styles.drawerPill}>ReqAgent</span>
        {onClose ? (
          <button className={styles.drawerClose} onClick={onClose} type="button">
            关闭
          </button>
        ) : null}
      </div>

      <div className={styles.drawerSection}>
        <span className={styles.drawerKicker}>当前会话</span>
        <h2 className={styles.drawerTitle}>{threadTitle}</h2>
        <p className={styles.drawerMeta}>agent · {currentAgent}</p>
      </div>

      <p className={styles.drawerHint}>{hint}</p>
    </aside>
  );
}
