"use client";

import styles from "@/components/ReqAgentPrimitives.module.css";

/**
 * Shown inside AssistantMessage when streaming has started but no
 * text/reasoning/tool parts have arrived yet.
 *
 * Registered as `components.Empty` in MessagePrimitive.Parts.
 */
export function ReqStreamingIndicator({ status }: { status: { type: string } }) {
  if (status.type !== "running") return null;

  return (
    <div className={styles.streamingIndicator}>
      <span className={styles.streamingDots}>
        <span className={styles.streamingDot} />
        <span className={styles.streamingDot} />
        <span className={styles.streamingDot} />
      </span>
      <span className={styles.streamingLabel}>正在回复</span>
    </div>
  );
}
