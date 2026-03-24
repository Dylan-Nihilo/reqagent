"use client";

import { useRef, useState } from "react";
import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqToolTerminalProps = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  isRunning: boolean;
  truncated?: boolean;
};

const ANSI_PATTERN =
  // Strip ANSI escape sequences so command output stays readable without extra deps.
  /\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export function ReqToolTerminal({
  stdout,
  stderr,
  exitCode,
  isRunning,
  truncated,
}: ReqToolTerminalProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  const normalizedStdout = sanitizeTerminalText(stdout);
  const normalizedStderr = sanitizeTerminalText(stderr);
  const hasOutput = Boolean(normalizedStdout || normalizedStderr);
  const joinedOutput = [normalizedStdout, normalizedStderr].filter(Boolean).join("\n\n");

  async function handleCopy() {
    if (!joinedOutput) return;

    try {
      await navigator.clipboard.writeText(joinedOutput);
      setCopied(true);

      if (resetTimerRef.current) {
        window.clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.toolTerminal}>
      <div className={styles.toolTerminalToolbar}>
        <div className={styles.toolTerminalMeta}>
          <span className={styles.toolTerminalBadge}>stdout</span>
          {normalizedStderr ? <span className={styles.toolTerminalBadge}>stderr</span> : null}
          {typeof exitCode === "number" ? (
            <span
              className={`${styles.toolTerminalBadge} ${
                exitCode === 0 ? styles.toolTerminalBadgeNeutral : styles.toolTerminalBadgeError
              }`}
            >
              exit {exitCode}
            </span>
          ) : isRunning ? (
            <span className={`${styles.toolTerminalBadge} ${styles.toolTerminalBadgeNeutral}`}>
              running
            </span>
          ) : null}
        </div>

        <button
          className={styles.toolDisclosureButton}
          disabled={!joinedOutput}
          onClick={() => {
            void handleCopy();
          }}
          type="button"
        >
          {copied ? "已复制" : "复制输出"}
        </button>
      </div>

      {hasOutput ? (
        <div className={styles.toolTerminalContent}>
          {normalizedStdout ? (
            <section className={styles.toolTerminalSection}>
              <p className={styles.toolTerminalLabel}>stdout</p>
              <pre className={styles.toolTerminalPre}>{normalizedStdout}</pre>
            </section>
          ) : null}

          {normalizedStderr ? (
            <section className={styles.toolTerminalSection}>
              <p className={styles.toolTerminalLabel}>stderr</p>
              <pre className={`${styles.toolTerminalPre} ${styles.toolTerminalPreError}`}>
                {normalizedStderr}
              </pre>
            </section>
          ) : null}

          {truncated ? <p className={styles.toolTerminalNote}>输出已截断。</p> : null}
        </div>
      ) : (
        <p className={styles.toolTerminalEmpty}>{isRunning ? "等待命令输出……" : "命令没有输出。"}</p>
      )}
    </div>
  );
}

function sanitizeTerminalText(value?: string): string | undefined {
  if (!value) return undefined;

  const stripped = value.replace(ANSI_PATTERN, "").replace(/\r\n/g, "\n").trimEnd();
  return stripped.length > 0 ? stripped : undefined;
}
