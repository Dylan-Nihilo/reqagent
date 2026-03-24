"use client";

import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqThinkingBlockProps = {
  mode: "running" | "completed" | "failed";
  open: boolean;
  onToggle: () => void;
  agent: string;
  phaseLabel?: string;
  elapsedLabel: string;
  summary: string;
};

export function ReqThinkingBlock({
  mode,
  open,
  onToggle,
  agent,
  phaseLabel,
  elapsedLabel,
  summary,
}: ReqThinkingBlockProps) {
  const statusLabel = mode === "running" ? "整理中" : mode === "failed" ? "未完成" : "已完成";

  return (
    <section
      className={[
        styles.thinkingCard,
        open ? styles.thinkingCardOpen : styles.thinkingCardCollapsed,
        mode === "completed" ? styles.thinkingCardCompleted : "",
        mode === "failed" ? styles.thinkingCardFailed : "",
      ].join(" ").trim()}
    >
      <button aria-expanded={open} className={styles.thinkingToggle} onClick={onToggle} type="button">
        <div className={styles.thinkingMain}>
          {open ? (
            <div className={styles.thinkingHead}>
              <span className={styles.thinkingLabel}>{statusLabel}</span>
              <span className={styles.thinkingAgent}>{agent}</span>
            </div>
          ) : (
            <span className={styles.thinkingCollapsedLabel}>thinking</span>
          )}
        </div>
        <div className={styles.thinkingMeta}>
          {open ? <span className={styles.thinkingElapsed}>{elapsedLabel}</span> : null}
          <span className={`${styles.thinkingChevron} ${open ? styles.thinkingChevronOpen : ""}`}>▾</span>
        </div>
      </button>

      <div className={`${styles.thinkingBody} ${open ? styles.thinkingBodyOpen : ""}`}>
        <div className={styles.thinkingContentWrap} aria-hidden={!open}>
          <div className={styles.thinkingContent}>
            <p className={styles.thinkingSummary}>{summary}</p>
            <div className={styles.thinkingHints}>
              <span className={styles.thinkingHint}>{agent}</span>
              {phaseLabel ? <span className={styles.thinkingHint}>{phaseLabel}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
