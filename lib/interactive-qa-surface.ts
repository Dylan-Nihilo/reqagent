import {
  buildInteractiveQaReplyDraft,
  extractInteractiveQaPayload,
  type InteractiveQaPayload,
} from "@/lib/docx-workflow";
import { summarizeMessageParts } from "@/lib/message-parts";
import type { ReqAgentMessageMeta } from "@/lib/types";
import { readMessageParts } from "@/lib/ui-message-utils";

type ComposerRuntimeLike = {
  getState: () => { runConfig?: any };
  setText: (draft: string) => void;
};

type ComposerAccessorLike = (() => ComposerRuntimeLike) & {
  source: string | null;
};

type ThreadRuntimeLike = {
  append: (message: any) => Promise<void> | void;
};

type ThreadAccessorLike = (() => ThreadRuntimeLike) & {
  source: string | null;
};

type InteractiveQaAuiLike = {
  composer: ComposerAccessorLike;
  thread: ThreadAccessorLike;
};

export type AssistantTextSurface =
  | {
      kind: "interactive-qa";
      payload: InteractiveQaPayload;
    }
  | {
      kind: "markdown";
      markdown: string;
    };

export function resolveAssistantTextSurface(text: string): AssistantTextSurface {
  const payload = extractInteractiveQaPayload(text);
  if (payload) {
    return {
      kind: "interactive-qa",
      payload,
    };
  }

  return {
    kind: "markdown",
    markdown: text,
    };
}

export type InteractiveQaCueSurface = {
  payload: InteractiveQaPayload;
  roundsRemaining?: number;
};

export function resolveInteractiveQaCueSurface(
  messageLike: unknown,
  metadata?: ReqAgentMessageMeta,
): InteractiveQaCueSurface | null {
  const parts = summarizeMessageParts(messageLike);
  if (parts.length === 0) {
    return null;
  }

  if (parts.some((part) => part.kind === "tool" || part.kind === "source" || part.kind === "file" || part.kind === "image")) {
    return null;
  }

  const text = extractAssistantText(messageLike);
  if (!text) return null;

  const payload = extractInteractiveQaPayload(text);
  if (!payload) return null;

  return {
    payload,
    roundsRemaining: metadata?.docxClarification?.roundsRemaining,
  };
}

export function resolveInteractiveQaSubmitter(
  aui: InteractiveQaAuiLike,
) {
  if (aui.composer.source == null || aui.thread.source == null) {
    return undefined;
  }

  return async (
    payload: InteractiveQaPayload,
    answers: string[],
  ) => {
    const draft = buildInteractiveQaReplyDraft(payload, answers);
    const runConfig = aui.composer().getState().runConfig;

    await aui.thread().append({
      content: [{ type: "text", text: draft }],
      runConfig,
    });
    aui.composer().setText("");
  };
}

function extractAssistantText(messageLike: unknown) {
  return readMessageParts(messageLike)
    .filter(
      (part): part is { type: "text"; text: string } =>
        part !== null &&
        part !== undefined &&
        typeof part === "object" &&
        "type" in part &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}
