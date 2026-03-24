"use client";

import { ComposerPrimitive, useThread, useThreadRuntime } from "@assistant-ui/react";
import { markMessageCancelled } from "@/lib/cancel-store";
import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqComposerProps = {
  variant: "landing" | "thread";
  placeholder: string;
  hint?: string;
  className?: string;
  preview?: boolean;
  previewValue?: string;
  previewRunning?: boolean;
};

export function ReqComposer({
  variant,
  placeholder,
  hint = "shift + enter 换行",
  className,
  preview = false,
  previewValue,
  previewRunning = false,
}: ReqComposerProps) {
  if (preview) {
    return <ReqComposerPreview hint={hint} previewRunning={previewRunning} previewValue={previewValue} variant={variant} placeholder={placeholder} className={className} />;
  }

  return <ReqComposerRuntime hint={hint} placeholder={placeholder} variant={variant} className={className} />;
}

function ReqComposerPreview({
  variant,
  placeholder,
  hint,
  className,
  previewValue,
  previewRunning,
}: Required<Pick<ReqComposerProps, "variant" | "placeholder" | "hint">> &
  Pick<ReqComposerProps, "className" | "previewValue" | "previewRunning">) {
  const frameClassName = `${styles.composerFrame} ${variant === "landing" ? styles.composerLanding : styles.composerThread}`;

  return (
    <div className={`${styles.composerRoot} ${className ?? ""}`.trim()}>
      <div className={frameClassName}>
        <textarea
          className={`${styles.composerInput} ${variant === "landing" ? styles.composerInputLanding : styles.composerInputThread}`}
          placeholder={placeholder}
          readOnly
          rows={variant === "landing" ? 5 : 3}
          value={previewValue ?? ""}
        />
        <div className={styles.composerActions}>
          <button
            className={previewRunning ? styles.composerActionSecondary : styles.composerActionPreview}
            disabled
            type="button"
          >
            {previewRunning ? "停止" : "发送"}
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
  className,
}: Required<Pick<ReqComposerProps, "variant" | "placeholder" | "hint">> & Pick<ReqComposerProps, "className">) {
  const frameClassName = `${styles.composerFrame} ${variant === "landing" ? styles.composerLanding : styles.composerThread}`;

  return (
    <ComposerPrimitive.Root className={`${styles.composerRoot} ${className ?? ""}`.trim()}>
      <div className={frameClassName}>
        <ComposerPrimitive.Input
          className={`${styles.composerInput} ${variant === "landing" ? styles.composerInputLanding : styles.composerInputThread}`}
          placeholder={placeholder}
          rows={variant === "landing" ? 5 : 3}
          submitMode="enter"
        />

        <div className={styles.composerActions}>
          <ComposerSendButton />
        </div>
      </div>

      {hint ? <div className={styles.composerHint}><span>{hint}</span></div> : null}
    </ComposerPrimitive.Root>
  );
}

function ComposerSendButton() {
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
    <ComposerPrimitive.Send className={styles.composerActionPrimary}>发送</ComposerPrimitive.Send>
  );
}
