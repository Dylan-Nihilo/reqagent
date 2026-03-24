"use client";

import type { ReactNode } from "react";
import { ReqNavDrawer } from "@/components/ReqNavDrawer";
import styles from "@/components/ReqAgentWorkbench.module.css";

type ReqAgentWorkbenchProps = {
  mode?: "runtime" | "preview";
  currentAgent: string;
  threadTitle: string;
  navHint: string;
  navOpen?: boolean;
  onNavToggle?: () => void;
  onNavClose?: () => void;
  hasArtifacts?: boolean;
  artifactCount?: number;
  artifactsOpen?: boolean;
  onArtifactsToggle?: () => void;
  onArtifactsClose?: () => void;
  artifactPanel?: ReactNode;
  children: ReactNode;
};

export function ReqAgentWorkbench({
  mode = "runtime",
  currentAgent,
  threadTitle,
  navHint,
  navOpen = false,
  onNavToggle,
  onNavClose,
  hasArtifacts = false,
  artifactCount = 0,
  artifactsOpen = false,
  onArtifactsToggle,
  onArtifactsClose,
  artifactPanel,
  children,
}: ReqAgentWorkbenchProps) {
  if (mode === "preview") {
    const showPreviewArtifacts = Boolean(artifactPanel);

    return (
      <div
        className={`${styles.previewWorkbench} ${showPreviewArtifacts ? "" : styles.previewWorkbenchNoArtifacts}`.trim()}
      >
        <aside className={styles.previewSidebar}>
          <ReqNavDrawer currentAgent={currentAgent} hint={navHint} threadTitle={threadTitle} />
        </aside>

        <section className={styles.previewChat}>{children}</section>

        {showPreviewArtifacts ? <aside className={styles.previewArtifacts}>{artifactPanel}</aside> : null}
      </div>
    );
  }

  return (
    <>
      <div className={styles.chromeBar}>
        <button className={styles.chromeButton} onClick={onNavToggle} type="button">
          <span className={styles.chromeButtonIcon}>≡</span>
          <span className={styles.chromeButtonLabel}>会话</span>
        </button>

        {hasArtifacts ? (
          <button className={styles.chromeButton} onClick={onArtifactsToggle} type="button">
            <span className={styles.chromeButtonIcon}>⌘</span>
            <span className={styles.chromeButtonLabel}>产物 {artifactCount}</span>
          </button>
        ) : (
          <span className={styles.chromePlaceholder} />
        )}
      </div>

      {navOpen ? (
        <button aria-label="关闭会话抽屉" className={styles.overlayBackdrop} onClick={onNavClose} type="button" />
      ) : null}
      {navOpen ? (
        <div className={styles.navDrawer}>
          <ReqNavDrawer
            currentAgent={currentAgent}
            hint={navHint}
            onToggle={onNavClose}
            threadTitle={threadTitle}
          />
        </div>
      ) : null}

      {hasArtifacts && artifactsOpen && artifactPanel ? (
        <>
          <button aria-label="关闭产物抽屉" className={styles.railBackdrop} onClick={onArtifactsClose} type="button" />
          <div className={styles.artifactOverlay}>{artifactPanel}</div>
        </>
      ) : null}

      <div className={styles.shell}>
        <div className={styles.chatStage}>{children}</div>
      </div>
    </>
  );
}
