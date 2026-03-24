"use client";

import { useState, type ReactNode } from "react";
import styles from "@/components/ReqAgentPrimitives.module.css";

type ToolCardStatus = "running" | "complete" | "incomplete";

type ToolCardMetric = {
  label: string;
  value: string;
};

type ReqToolCardProps = {
  name: string;
  description: string;
  status: ToolCardStatus;
  summary?: string;
  metrics?: ToolCardMetric[];
  children?: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
};

const statusLabel: Record<ToolCardStatus, string> = {
  running: "执行中",
  complete: "已完成",
  incomplete: "异常",
};

const statusClassName: Record<ToolCardStatus, string> = {
  running: styles.toolStatusRunning,
  complete: styles.toolStatusComplete,
  incomplete: styles.toolStatusIncomplete,
};

const dotClassName: Record<ToolCardStatus, string> = {
  running: styles.statusRunning,
  complete: styles.statusComplete,
  incomplete: styles.statusIncomplete,
};

export function ReqToolCard({
  name,
  description,
  status,
  summary,
  metrics,
  children,
  collapsible = false,
  defaultExpanded = false,
  expandLabel = "展开详情",
  collapseLabel = "收起详情",
}: ReqToolCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const canToggle = collapsible && Boolean(children);

  return (
    <article className={styles.toolCard}>
      <div className={styles.toolHead}>
        <div className={styles.toolDotWrap}>
          <div className={`${styles.toolDot} ${dotClassName[status]}`} />
        </div>

        <div className={styles.toolMeta}>
          <div className={styles.toolTitleRow}>
            <p className={styles.toolName}>{name}</p>
            <span className={`${styles.toolStatus} ${statusClassName[status]}`}>{statusLabel[status]}</span>
          </div>

          <p className={styles.toolDescription}>{description}</p>
          {summary ? <p className={styles.toolSummary}>{summary}</p> : null}

          {metrics && metrics.length > 0 ? (
            <div className={styles.toolDataGrid}>
              {metrics.map((metric) => (
                <div key={`${name}-${metric.label}`} className={styles.toolDataItem}>
                  <span className={styles.toolDataLabel}>{metric.label}</span>
                  <span className={styles.toolDataValue}>{metric.value}</span>
                </div>
              ))}
            </div>
          ) : null}

          {canToggle ? (
            <div className={styles.toolDisclosure}>
              <button
                className={styles.toolDisclosureButton}
                onClick={() => setExpanded((current) => !current)}
                type="button"
              >
                {expanded ? collapseLabel : expandLabel}
              </button>
            </div>
          ) : null}

          {children && (!canToggle || expanded) ? <div className={styles.toolExtra}>{children}</div> : null}
        </div>
      </div>
    </article>
  );
}
