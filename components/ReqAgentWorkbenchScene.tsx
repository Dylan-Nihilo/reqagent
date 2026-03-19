"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import type { ReactNode } from "react";
import styles from "@/components/ReqAgentWorkbench.module.css";

export type ReqAgentWorkbenchSceneProps = {
  mode?: "runtime" | "preview";
  hasArtifacts?: boolean;
  artifactsOpen?: boolean;
  header?: ReactNode;
  messages: ReactNode;
  thinking?: ReactNode;
  scrollToBottom?: ReactNode;
  composer: ReactNode;
};

export function ReqAgentWorkbenchScene({
  mode = "runtime",
  hasArtifacts = false,
  artifactsOpen = false,
  header,
  messages,
  thinking,
  scrollToBottom,
  composer,
}: ReqAgentWorkbenchSceneProps) {
  const threadRootClassName = `${styles.threadRoot} ${hasArtifacts && artifactsOpen ? styles.threadRootWithArtifacts : ""}`.trim();

  if (mode === "preview") {
    return (
      <div className={threadRootClassName}>
        <div className={`${styles.viewport} ${styles.viewportPreview}`}>
          <div className={styles.threadContent}>
            {header}
            {messages}
            {thinking}
          </div>

          <div className={`${styles.viewportFooter} ${styles.viewportFooterPreview}`}>
            <div className={styles.viewportFooterInner}>
              {scrollToBottom}
              {composer}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ThreadPrimitive.Root className={threadRootClassName}>
      <ThreadPrimitive.Viewport
        autoScroll
        className={styles.viewport}
        scrollToBottomOnInitialize
        scrollToBottomOnRunStart
        turnAnchor="bottom"
      >
        <div className={styles.threadContent}>
          {header}
          {messages}
          {thinking}
        </div>

        <ThreadPrimitive.ViewportFooter className={styles.viewportFooter}>
          <div className={styles.viewportFooterInner}>
            {scrollToBottom}
            {composer}
          </div>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
