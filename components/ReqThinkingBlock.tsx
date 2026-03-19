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
  const statusLabel = mode === "running" ? "thinking" : mode === "failed" ? "failed" : "completed";

  if (!open) {
    return (
      <button className={styles.thinkingChip} onClick={onToggle} type="button">
        <span className={styles.thinkingChipLabel}>{mode === "running" ? "thinking" : mode === "failed" ? "failed" : "done"}</span>
        <span className={styles.thinkingChipSummary}>
          {agent}
          {phaseLabel ? ` · ${phaseLabel}` : ""}
        </span>
        <span className={styles.thinkingElapsed}>{elapsedLabel}</span>
      </button>
    );
  }

  return (
    <section
      className={`${styles.thinkingCard} ${mode === "completed" ? styles.thinkingCardCompleted : ""} ${mode === "failed" ? styles.thinkingCardFailed : ""}`.trim()}
    >
      <button className={styles.thinkingToggle} onClick={onToggle} type="button">
        <div className={styles.thinkingHead}>
          <span className={styles.thinkingLabel}>{statusLabel}</span>
          <span className={styles.thinkingAgent}>{agent}</span>
        </div>
        <div className={styles.thinkingMeta}>
          <span className={styles.thinkingElapsed}>{elapsedLabel}</span>
          <span className={styles.thinkingChevronOpen}>▾</span>
        </div>
      </button>
      <div className={styles.thinkingContent}>
        <p className={styles.thinkingSummary}>{summary}</p>
        <div className={styles.thinkingHints}>
          <span className={styles.thinkingHint}>Agent · {agent}</span>
          <span className={styles.thinkingHint}>Phase · {phaseLabel ?? "待判断"}</span>
        </div>
      </div>
    </section>
  );
}
