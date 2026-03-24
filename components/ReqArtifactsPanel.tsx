"use client";

import { useEffect, useMemo, useState } from "react";
import { ReqMessageMarkdownPreview } from "@/components/message-ui/ReqMessageUI";
import type { ReqArtifactItem, ReqPendingArtifact } from "@/lib/use-artifacts";
import styles from "@/components/ReqArtifactsPanel.module.css";

type ReqArtifactsPanelProps = {
  items: ReqArtifactItem[];
  pending: ReqPendingArtifact | null;
  onClose?: () => void;
};

export function ReqArtifactsPanel({ items, pending, onClose }: ReqArtifactsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"copied" | "exported" | null>(null);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [items, selectedId]);

  useEffect(() => {
    if (!feedback) return undefined;

    const timeout = window.setTimeout(() => setFeedback(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  async function handleCopy() {
    if (!selected?.markdown) return;
    await navigator.clipboard.writeText(selected.markdown);
    setFeedback("copied");
  }

  function handleExport() {
    if (!selected?.markdown) return;

    const blob = new Blob([selected.markdown], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = selected.exportName;
    link.click();
    URL.revokeObjectURL(href);
    setFeedback("exported");
  }

  return (
    <section className={styles.panel}>
      {selected ? (
        <div className={styles.detailView}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <button className={styles.backButton} onClick={() => setSelectedId(null)} type="button">
                <span aria-hidden="true">←</span>
                返回
              </button>
              <div className={styles.headerCopy}>
                <p className={styles.title}>{selected.label}</p>
                <p className={styles.subtitle}>{selected.summary}</p>
              </div>
            </div>
            {onClose ? (
              <button aria-label="收起产物面板" className={styles.iconButton} onClick={onClose} type="button">
                ×
              </button>
            ) : null}
          </div>

          <div className={styles.detailMeta}>
            <span className={styles.metaPill}>{selected.meta}</span>
            <span className={styles.metaPill}>{selected.toolName}</span>
            {feedback ? <span className={styles.feedbackPill}>{feedback === "copied" ? "已复制" : "已导出"}</span> : null}
          </div>

          <div className={styles.actions}>
            <button className={styles.actionButton} onClick={handleCopy} type="button">
              复制
            </button>
            <button className={styles.actionButton} onClick={handleExport} type="button">
              导出 Markdown
            </button>
          </div>

          <div className={styles.detailBody}>
            <ReqMessageMarkdownPreview markdown={selected.markdown} />
          </div>
        </div>
      ) : (
        <div className={styles.listView}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.headerCopy}>
                <p className={styles.title}>产物</p>
                <p className={styles.subtitle}>从本轮工具输出中提炼出的可复用结果</p>
              </div>
              <span className={styles.countBadge}>{items.length + (pending ? 1 : 0)}</span>
            </div>
            {onClose ? (
              <button aria-label="收起产物面板" className={styles.iconButton} onClick={onClose} type="button">
                ×
              </button>
            ) : null}
          </div>

          <div className={styles.list}>
            {items.map((item) => (
              <button
                className={styles.item}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <span className={styles.itemAccent} aria-hidden="true" />
                <span className={styles.itemIcon} aria-hidden="true">{item.icon}</span>
                <span className={styles.itemBody}>
                  <span className={styles.itemLabelRow}>
                    <span className={styles.itemLabel}>{item.label}</span>
                    <span className={styles.itemArrow} aria-hidden="true">→</span>
                  </span>
                  <span className={styles.itemSummary}>{item.summary}</span>
                  <span className={styles.itemMeta}>{item.meta}</span>
                </span>
              </button>
            ))}

            {pending ? (
              <div className={`${styles.item} ${styles.itemPending}`}>
                <span className={styles.itemAccent} aria-hidden="true" />
                <span className={styles.itemIcon} aria-hidden="true">{pending.icon}</span>
                <span className={styles.itemBody}>
                  <span className={styles.itemLabelRow}>
                    <span className={styles.itemLabel}>{pending.label}</span>
                    <span className={styles.pendingDots} aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </span>
                  <span className={styles.itemMeta}>{pending.summary}</span>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
