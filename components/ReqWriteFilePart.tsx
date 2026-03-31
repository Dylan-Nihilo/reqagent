"use client";

import { useMemo } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { useAuiState } from "@assistant-ui/store";
import { ReqToolPart } from "@/components/tool-ui/ReqToolUI";
import { getToolInvocationStateLabel } from "@/lib/tool-invocation-states";
import {
  parseToolArgsText,
  resolveToolInvocationViewState,
  type ReqAgentMessageMeta,
  type ToolInvocationViewState,
} from "@/lib/types";
import styles from "@/components/ReqWriteFilePart.module.css";

export function ReqWriteFilePart(props: ToolCallMessagePartProps) {
  const meta = useCurrentMessageMeta();
  const viewState = resolveToolInvocationViewState({
    argsText: props.argsText,
    interrupt: props.interrupt,
    isError: props.isError,
    metadata: meta,
    result: props.result,
    status: props.status,
    toolCallId: props.toolCallId,
  });

  if (viewState === "failed" || viewState === "input_invalid" || viewState === "denied") {
    return <ReqToolPart {...props} />;
  }

  const args = useMemo(() => {
    if (props.args && typeof props.args === "object" && !Array.isArray(props.args)) {
      return props.args as Record<string, unknown>;
    }

    return props.argsText ? parseToolArgsText(props.argsText) : null;
  }, [props.args, props.argsText]);

  const result = props.result && typeof props.result === "object" && !Array.isArray(props.result)
    ? (props.result as Record<string, unknown>)
    : null;
  const targetPath = normalizeString(result?.path) || normalizeString(args?.path) || "未命名文件";
  const mode = normalizeString(result?.mode) || normalizeString(args?.mode) || "overwrite";

  return (
    <div
      className={[
        styles.notice,
        getToneClassName(viewState),
      ].join(" ").trim()}
    >
      <span className={styles.rail} aria-hidden="true" />
      <div className={styles.body}>
        <div className={styles.topline}>
          <span className={styles.label}>文件写入</span>
          <span className={styles.status}>{getToolInvocationStateLabel(viewState)}</span>
          <span className={styles.handoff}>右侧产物承接</span>
        </div>

        <div className={styles.pathRow}>
          <code className={styles.path}>{targetPath}</code>
          <span className={styles.mode}>{humanizeMode(mode)}</span>
        </div>

        <p className={styles.caption}>{buildCaption(viewState)}</p>
      </div>
    </div>
  );
}

function useCurrentMessageMeta(): ReqAgentMessageMeta | null {
  return useAuiState((state) => {
    const metadata = state.message.metadata as Record<string, unknown> | undefined;
    const custom = metadata?.custom;
    return custom && typeof custom === "object" ? (custom as ReqAgentMessageMeta) : null;
  });
}

function buildCaption(state: ToolInvocationViewState) {
  switch (state) {
    case "drafting_input":
      return "正在整理内容，完成后同步到右侧。";
    case "executing":
    case "streaming_output":
      return "文件写入中，右侧面板实时承接。";
    case "succeeded":
      return "写入完成，详细预览已转入右侧。";
    default:
      return "文件处理已转交右侧工作台。";
  }
}

function humanizeMode(mode: string) {
  switch (mode) {
    case "append":
      return "追加";
    case "patch":
      return "补丁";
    default:
      return "覆盖";
  }
}

function getToneClassName(state: ToolInvocationViewState) {
  switch (state) {
    case "succeeded":
      return styles.noticeSuccess;
    case "executing":
    case "streaming_output":
      return styles.noticeActive;
    default:
      return styles.noticeIdle;
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
