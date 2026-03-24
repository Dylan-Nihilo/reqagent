"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type ReactNode, type SVGProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "@/components/message-ui/ReqMessageUI.module.css";

export type ReqMessageRole = "user" | "assistant" | "system";
export type ReqMessageVisualStatus = "pending" | "streaming" | "complete" | "failed" | "cancelled";
export type ReqMessageAction = {
  label: string;
  tone?: "default" | "positive" | "danger";
};

type ReqMessageFrameProps = {
  role: ReqMessageRole;
  status?: ReqMessageVisualStatus;
  title?: string;
  monogram?: string;
  meta?: string;
  branchLabel?: string;
  isRetry?: boolean;
  signals?: string[];
  actions?: ReqMessageAction[];
  children: ReactNode;
  className?: string;
};

type SourceItem = {
  title?: string;
  url: string;
};

export function ReqMessageFrame({
  role,
  status = "complete",
  title,
  monogram,
  meta,
  branchLabel,
  isRetry = false,
  signals,
  actions,
  children,
  className,
}: ReqMessageFrameProps) {
  const hasContextMeta = isRetry || Boolean(branchLabel);
  const showStatusPill = role !== "user" && (status === "failed" || status === "cancelled");
  const hasHeadMeta = Boolean(meta || showStatusPill);

  if (role === "system") {
    return (
      <section
        className={[
          styles.message,
          styles.messageSystem,
          className ?? "",
        ].join(" ").trim()}
        data-role={role}
        data-status={status}
      >
        <div className={styles.systemNotice}>
          <div className={styles.systemHead}>
            <div className={styles.systemIdentity}>
              <span className={styles.systemLeadGlyph}>
                <StatusGlyph status={status} />
              </span>
              <span className={styles.systemLabel}>{title ?? "系统消息"}</span>
            </div>
            <span className={styles.statusPill}>
              <StatusGlyph status={status} />
              {statusLabel(status)}
            </span>
          </div>
          <div className={styles.systemBody}>{children}</div>
          <MessageFooter actions={actions} signals={signals} />
        </div>
      </section>
    );
  }

  return (
    <section
      className={[
        styles.message,
        role === "user" ? styles.messageUser : styles.messageAssistant,
        className ?? "",
      ].join(" ").trim()}
      data-role={role}
      data-status={status}
    >
      <div className={styles.messageRail} aria-hidden="true">
        <div className={styles.messageNode}>
          {monogram ? <span>{monogram}</span> : <RoleGlyph role={role} />}
        </div>
      </div>

      <div className={styles.messageMain}>
        {hasContextMeta ? (
          <div className={styles.messageContextRow}>
            <div className={styles.messageIdentity}>
              <div className={styles.messageContextMeta}>
                {isRetry ? <span className={styles.contextMetaItem}>重试回复</span> : null}
                {branchLabel ? <span className={styles.contextMetaItem}>分支 {branchLabel}</span> : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.messageBodyRow}>
          <div className={styles.messageBubble}>
            <div className={styles.bubbleBody}>
              <div className={styles.messageContent}>{children}</div>
            </div>
          </div>
          {hasHeadMeta ? (
            <div className={styles.messageHeadMeta}>
              {meta ? <span className={styles.messageMeta}>{meta}</span> : null}
              {showStatusPill ? (
                <span className={styles.statusPill}>
                  <StatusGlyph status={status} />
                  {statusLabel(status)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <MessageFooter actions={actions} signals={signals} />
      </div>
    </section>
  );
}

export function ReqMessageMarkdownPreview({
  markdown,
  streaming = false,
}: {
  markdown: string;
  streaming?: boolean;
}) {
  // Append a zero-width marker so the cursor renders inline with the last text
  const source = streaming ? `${markdown}\u200B` : markdown;

  return (
    <div className={`${styles.richText} ${streaming ? styles.richTextStreaming : ""}`}>
      <Markdown remarkPlugins={[remarkGfm]}>{source}</Markdown>
    </div>
  );
}

export function ReqMessageSourceList({ items }: { items: SourceItem[] }) {
  return (
    <div className={styles.sourceList}>
      {items.map((item) => (
        <a
          key={`${item.url}-${item.title ?? "source"}`}
          className={styles.sourceItem}
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          <div className={styles.sourceTitleRow}>
            <SourceGlyph />
            <span className={styles.sourceTitle}>{item.title ?? item.url}</span>
            <span className={styles.sourceHost}>{safeHost(item.url)}</span>
          </div>
          <span className={[styles.sourceUrl, styles.mono].join(" ").trim()}>{item.url}</span>
        </a>
      ))}
    </div>
  );
}

export function ReqMessageFileTile({
  filename,
  mimeType,
  sizeLabel,
}: {
  filename?: string;
  mimeType: string;
  sizeLabel?: string;
}) {
  return (
    <article className={styles.fileTile}>
      <div className={styles.fileTitleRow}>
        <FileGlyph />
        <span className={styles.fileTitle}>{filename ?? "文件附件"}</span>
        <span className={styles.fileMeta}>{mimeType}</span>
      </div>
      <p className={styles.fileSummary}>
        {sizeLabel ? `内容已附加，约 ${sizeLabel}。` : "内容已附加，可在后续流程中消费。"}
      </p>
    </article>
  );
}

export function ReqMessageImageTile({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className={styles.imageTile}>
      <img alt={alt} className={styles.imageMedia} src={src} />
      {caption ? (
        <figcaption className={styles.imageCaption}>
          <span>{caption}</span>
          <span className={styles.mono}>{alt}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

const DEFAULT_PENDING_PHASES = ["读取问题", "整理线索", "准备回应"] as const;

export function ReqMessagePendingLine({
  label,
  phases = [...DEFAULT_PENDING_PHASES],
  showNode = false,
}: {
  label: string;
  phases?: string[];
  showNode?: boolean;
}) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const currentPhase = phases[phaseIndex % Math.max(phases.length, 1)];
  const visibleText = currentPhase || label;

  useEffect(() => {
    if (phases.length <= 1) {
      setPhaseIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setPhaseIndex((value) => (value + 1) % phases.length);
    }, 1400);

    return () => window.clearInterval(timer);
  }, [phases]);

  return (
    <div
      className={[
        styles.pendingIndicator,
        showNode ? styles.pendingIndicatorWithNode : styles.pendingIndicatorInline,
      ].join(" ").trim()}
    >
      {showNode ? (
        <span className={styles.pendingNode} aria-hidden="true">
          <span className={styles.pendingNodeHalo} />
          <span className={styles.pendingNodeCore}>
            <RoleGlyph role="assistant" />
          </span>
        </span>
      ) : null}
      <div className={styles.pendingBody}>
        <span className={styles.pendingLabel} aria-label={label || visibleText}>
          <span key={visibleText} className={styles.pendingPhaseCurrent}>
            {visibleText}
          </span>
          <span className={styles.pendingDots} aria-hidden="true">
            <span className={styles.pendingDot} />
            <span className={styles.pendingDot} />
            <span className={styles.pendingDot} />
          </span>
        </span>
      </div>
    </div>
  );
}

export function estimateDataSizeLabel(data: string) {
  if (typeof data !== "string") return undefined;

  const normalized = data.trim();

  if (!normalized) return undefined;

  const bytes = normalized.startsWith("data:")
    ? Math.round((normalized.length * 3) / 4)
    : new TextEncoder().encode(normalized).length;

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function defaultTitle(role: ReqMessageRole) {
  switch (role) {
    case "user":
      return "Dylan";
    case "system":
      return "系统";
    default:
      return "ReqAgent";
  }
}

function statusLabel(status: ReqMessageVisualStatus) {
  switch (status) {
    case "pending":
      return "整理中";
    case "streaming":
      return "回答中";
    case "failed":
      return "未完成";
    case "cancelled":
      return "已停止";
    default:
      return "已完成";
  }
}

function actionToneClass(tone: ReqMessageAction["tone"]) {
  switch (tone) {
    case "positive":
      return styles.actionPositive;
    case "danger":
      return styles.actionDanger;
    default:
      return styles.actionDefault;
  }
}

function MessageFooter({
  signals,
  actions,
}: {
  signals?: string[];
  actions?: ReqMessageAction[];
}) {
  if (!signals?.length && !actions?.length) {
    return null;
  }

  return (
    <div className={styles.messageFoot}>
      {signals?.length ? (
        <div className={styles.signals}>
          {signals.map((signal) => (
            <span key={signal} className={styles.signalItem}>
              {signal}
            </span>
          ))}
        </div>
      ) : null}

      {actions?.length ? (
        <div className={styles.actions}>
          {actions.map((action) => (
            <span
              key={`${action.label}-${action.tone ?? "default"}`}
              className={[styles.actionButton, actionToneClass(action.tone)].join(" ").trim()}
              title={action.label}
            >
              <ActionGlyph label={action.label} tone={action.tone} />
              <span className={styles.actionLabel}>{action.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function RoleGlyph({ role }: { role: ReqMessageRole }) {
  if (role === "user") {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </svg>
    );
  }

  return (
    <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <rect x="5" y="6" width="14" height="11" rx="3" />
      <path d="M9 3.5v2" />
      <path d="M15 3.5v2" />
      <circle cx="10" cy="11.5" r="1" />
      <circle cx="14" cy="11.5" r="1" />
      <path d="M9.5 15h5" />
    </svg>
  );
}

function StatusGlyph({ status }: { status: ReqMessageVisualStatus }) {
  switch (status) {
    case "pending":
      return (
        <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M12 6v6l3.5 2" />
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
    case "streaming":
      return (
        <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M4.5 12h3" />
          <path d="M9.5 12H13" />
          <path d="M15 12h4.5" />
        </svg>
      );
    case "failed":
      return (
        <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5" />
          <path d="M12 16.5h.01" />
        </svg>
      );
    case "cancelled":
      return (
        <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" />
          <path d="m8.5 15.5 7-7" />
        </svg>
      );
    default:
      return (
        <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="m5.5 12.5 4 4L18.5 7.5" />
        </svg>
      );
  }
}

function SourceGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" {...props}>
      <path d="M10.5 13.5 13.5 10.5" />
      <path d="M8 16a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-.5.5" />
      <path d="M16 8a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l.5-.5" />
    </svg>
  );
}

function FileGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" {...props}>
      <path d="M8 4.5h5l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-7A3.5 3.5 0 0 1 5 17V8A3.5 3.5 0 0 1 8.5 4.5Z" />
      <path d="M13 4.5V9h4.5" />
      <path d="M8.5 13h6" />
      <path d="M8.5 16h6" />
    </svg>
  );
}

function ActionGlyph({
  label,
  tone,
}: {
  label: string;
  tone?: ReqMessageAction["tone"];
}) {
  const normalized = label.toLowerCase();

  if (normalized.includes("复制") || normalized.includes("copy")) {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      </svg>
    );
  }

  if (normalized.includes("编辑") || normalized.includes("edit")) {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="m4.5 19.5 4.3-1 8.6-8.6a2.1 2.1 0 1 0-3-3L5.8 15.5l-1.3 4Z" />
        <path d="m13.5 7.5 3 3" />
      </svg>
    );
  }

  if (normalized.includes("重试") || normalized.includes("重新生成") || normalized.includes("retry")) {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </svg>
    );
  }

  if (normalized.includes("赞同")) {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M7.5 10.5h-2A1.5 1.5 0 0 0 4 12v6A1.5 1.5 0 0 0 5.5 19.5h2Z" />
        <path d="m10 19.5 6.1-.1a2 2 0 0 0 1.9-1.5l1-4.8A2 2 0 0 0 17 10.5h-3V7.7a2.2 2.2 0 0 0-4-.9l-2.5 3.7v9Z" />
      </svg>
    );
  }

  if (normalized.includes("否") || normalized.includes("不适用") || tone === "danger") {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M7.5 13.5h-2A1.5 1.5 0 0 1 4 12v-6A1.5 1.5 0 0 1 5.5 4.5h2Z" />
        <path d="m10 4.5 6.1.1A2 2 0 0 1 18 6.1l1 4.8a2 2 0 0 1-1.9 2.6h-3v2.8a2.2 2.2 0 0 1-4 .9L7.5 13.5v-9Z" />
      </svg>
    );
  }

  if (normalized.includes("继续") || normalized.includes("追问")) {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M5 12h13" />
        <path d="m14 6 6 6-6 6" />
      </svg>
    );
  }

  if (normalized.includes("查看")) {
    return (
      <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
        <path d="M4.5 19.5h15" />
        <path d="M6.5 16V8.5" />
        <path d="M12 16V4.5" />
        <path d="M17.5 16V11" />
      </svg>
    );
  }

  return (
    <svg className={styles.glyph} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <circle cx="6.5" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="17.5" cy="12" r="1.25" />
    </svg>
  );
}
