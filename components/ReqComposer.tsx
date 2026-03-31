"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ComposerPrimitive, useThread, useThreadRuntime } from "@assistant-ui/react";
import { useAui, useAuiState } from "@assistant-ui/store";
import { markMessageCancelled } from "@/lib/cancel-store";
import { ReqArrowRightIcon } from "@/components/ReqIcons";
import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqComposerProps = {
  variant: "landing" | "thread";
  placeholder: string;
  hint?: string;
  submitLabel?: string;
  className?: string;
  preview?: boolean;
  previewValue?: string;
  previewRunning?: boolean;
  workspaceId?: string;
};

export function ReqComposer({
  variant,
  placeholder,
  hint = "enter 发送",
  submitLabel = variant === "landing" ? "开始分析" : "发送",
  className,
  preview = false,
  previewValue,
  previewRunning = false,
  workspaceId,
}: ReqComposerProps) {
  if (preview) {
    return <ReqComposerPreview hint={hint} previewRunning={previewRunning} previewValue={previewValue} submitLabel={submitLabel} variant={variant} placeholder={placeholder} className={className} />;
  }

  return <ReqComposerRuntime hint={hint} placeholder={placeholder} submitLabel={submitLabel} variant={variant} className={className} workspaceId={workspaceId} />;
}

function ReqComposerPreview({
  variant,
  placeholder,
  hint,
  submitLabel,
  className,
  previewValue,
  previewRunning,
}: Required<Pick<ReqComposerProps, "variant" | "placeholder" | "hint">> &
  Pick<ReqComposerProps, "className" | "previewValue" | "previewRunning" | "submitLabel">) {
  const frameClassName = `${styles.composerFrame} ${variant === "landing" ? styles.composerLanding : styles.composerThread}`;

  return (
    <div className={`${styles.composerRoot} ${className ?? ""}`.trim()}>
      <div className={frameClassName}>
        <textarea
          className={`${styles.composerInput} ${variant === "landing" ? styles.composerInputLanding : styles.composerInputThread}`}
          placeholder={placeholder}
          readOnly
          rows={1}
          value={previewValue ?? ""}
        />
        <div className={styles.composerActions}>
          <button
            className={previewRunning ? styles.composerActionSecondary : styles.composerActionPreview}
            disabled
            type="button"
          >
            {previewRunning ? (
              "停止"
            ) : (
              <>
                <ReqArrowRightIcon className={styles.composerActionIcon} />
                <span>{submitLabel}</span>
              </>
            )}
          </button>
        </div>
      </div>
      {hint ? <div className={styles.composerHint}><span>{hint}</span></div> : null}
    </div>
  );
}

function ReqComposerRuntime({
  variant,
  placeholder,
  hint,
  submitLabel,
  className,
  workspaceId = "global",
}: Required<Pick<ReqComposerProps, "variant" | "placeholder" | "hint">> &
  Pick<ReqComposerProps, "className" | "submitLabel" | "workspaceId">) {
  const aui = useAui();
  const composerText = useAuiState((state) => state.composer.text);
  const threadScopeId = useAuiState(
    (state) => state.threadListItem.remoteId ?? state.threadListItem.id ?? "draft",
  );
  const frameClassName = `${styles.composerFrame} ${variant === "landing" ? styles.composerLanding : styles.composerThread}`;
  const storageKey = useMemo(
    () => buildComposerDraftStorageKey(workspaceId, threadScopeId),
    [threadScopeId, workspaceId],
  );
  const pendingRestoreRef = useRef<string | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  // Restore persisted draft once per workspace/thread scope, but do not clobber
  // any text already present in the live composer.
  useEffect(() => {
    if (typeof window === "undefined") return;

    setHydratedKey(null);
    pendingRestoreRef.current = null;

    const savedDraft = window.localStorage.getItem(storageKey);
    const currentText = aui.composer().getState().text;

    if (savedDraft && !currentText.trim()) {
      pendingRestoreRef.current = savedDraft;
      aui.composer().setText(savedDraft);
      return;
    }

    setHydratedKey(storageKey);
  }, [aui, storageKey]);

  useEffect(() => {
    if (!pendingRestoreRef.current) return;
    if (composerText !== pendingRestoreRef.current && !composerText.trim()) return;

    pendingRestoreRef.current = null;
    setHydratedKey(storageKey);
  }, [composerText, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined" || hydratedKey !== storageKey) return;

    if (composerText.trim()) {
      window.localStorage.setItem(storageKey, composerText);
      return;
    }

    window.localStorage.removeItem(storageKey);
  }, [composerText, hydratedKey, storageKey]);

  return (
    <ComposerPrimitive.Root className={`${styles.composerRoot} ${className ?? ""}`.trim()}>
      <div className={frameClassName}>
        <ComposerPrimitive.Input
          className={`${styles.composerInput} ${variant === "landing" ? styles.composerInputLanding : styles.composerInputThread}`}
          placeholder={placeholder}
          rows={1}
          submitMode="enter"
        />

        <div className={styles.composerActions}>
          <ComposerSendButton submitLabel={submitLabel} />
        </div>
      </div>

      {hint ? <div className={styles.composerHint}><span>{hint}</span></div> : null}
    </ComposerPrimitive.Root>
  );
}

function ComposerSendButton({ submitLabel }: { submitLabel?: string }) {
  const isRunning = useThread((s) => s.isRunning);
  const threadRuntime = useThreadRuntime();
  const lastAssistantId = useThread((s) => {
    const msgs = s.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "assistant") return msgs[i].id;
    }
    return undefined;
  });

  if (isRunning) {
    return (
      <button
        className={styles.composerActionSecondary}
        onClick={() => {
          if (lastAssistantId) markMessageCancelled(lastAssistantId);
          threadRuntime.cancelRun();
        }}
        type="button"
      >
        停止
      </button>
    );
  }

  return (
    <ComposerPrimitive.Send className={styles.composerActionPrimary}>
      <ReqArrowRightIcon className={styles.composerActionIcon} />
      <span>{submitLabel ?? "发送"}</span>
    </ComposerPrimitive.Send>
  );
}

function buildComposerDraftStorageKey(workspaceId: string, threadScopeId: string) {
  return `reqagent-composer-draft:${workspaceId}:${threadScopeId}`;
}
