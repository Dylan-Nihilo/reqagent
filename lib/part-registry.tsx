"use client";

import { useMemo } from "react";

/**
 * Centralized part-component registry for MessagePrimitive.Parts.
 *
 * Simple adapters (Text, File, Image, Source) are inlined here instead of
 * living in separate files — they are pure hook→display bridges with no
 * business logic of their own.
 *
 * Complex parts (Reasoning, ToolCall) keep their own files because they
 * carry internal state or dispatch logic.
 */

import {
  useMessage,
  useThread,
  useMessagePartText,
  useMessagePartFile,
  useMessagePartImage,
  useMessagePartSource,
} from "@assistant-ui/react";
import { useAui, useAuiState } from "@assistant-ui/store";
import {
  ReqMessageMarkdownPreview,
  ReqMessageFileTile,
  ReqMessageImageTile,
  ReqMessageSourceList,
  estimateDataSizeLabel,
} from "@/components/message-ui/ReqMessageUI";
import { ReqInteractiveQaCard } from "@/components/ReqInteractiveQaCard";
import { ReqReasoningPart } from "@/components/ReqReasoningPart";
import { ReqToolCallPart } from "@/components/ReqToolCallPart";
import { ReqWriteFilePart } from "@/components/ReqWriteFilePart";
import {
  resolveAssistantTextSurface,
  resolveInteractiveQaSubmitter,
} from "@/lib/interactive-qa-surface";
import type { ReqAgentMessageMeta } from "@/lib/types";

// ---------------------------------------------------------------------------
// Inline part adapters (hook → display, no extra logic)
// ---------------------------------------------------------------------------

function TextPart() {
  const { text, status } = useMessagePartText();
  return <ReqMessageMarkdownPreview markdown={text} streaming={status.type === "running"} />;
}

function AssistantTextPart() {
  const { text, status } = useMessagePartText();
  const aui = useAui();
  const messageId = useMessage((state) => state.id);
  const qaSurfaceState = useThread((state) => {
    const currentIndex = state.messages.findIndex((message) => message.id === messageId);
    if (currentIndex < 0) return "historical" as const;

    const trailingMessages = state.messages.slice(currentIndex + 1);
    if (trailingMessages.some((message) => message.role === "assistant")) {
      return "historical" as const;
    }

    if (trailingMessages.some((message) => message.role === "user")) {
      return "submitted" as const;
    }

    return "interactive" as const;
  });
  const meta = useAuiState((state) => {
    const metadata = state.message.metadata as Record<string, unknown> | undefined;
    const custom = metadata?.custom;
    return custom && typeof custom === "object" ? (custom as ReqAgentMessageMeta) : null;
  });
  const surface = resolveAssistantTextSurface(text);
  const interactiveQaSubmitter = useMemo(() => resolveInteractiveQaSubmitter(aui), [aui]);

  if (surface.kind === "interactive-qa") {
    return (
      <ReqInteractiveQaCard
        onSubmitAnswers={interactiveQaSubmitter}
        payload={surface.payload}
        roundsRemaining={meta?.docxClarification?.roundsRemaining}
        surfaceState={qaSurfaceState}
      />
    );
  }

  return <ReqMessageMarkdownPreview markdown={surface.markdown} streaming={status.type === "running"} />;
}

function FilePart() {
  const { filename, data, mimeType } = useMessagePartFile();
  return <ReqMessageFileTile filename={filename} mimeType={mimeType} sizeLabel={estimateDataSizeLabel(data)} />;
}

function ImagePart() {
  const { image, filename } = useMessagePartImage();
  return <ReqMessageImageTile alt={filename ?? "message-image"} caption={filename ?? "图像附件"} src={image} />;
}

function SourcePart() {
  const { title, url } = useMessagePartSource();
  return <ReqMessageSourceList items={[{ title, url }]} />;
}

// ---------------------------------------------------------------------------
// Exported component maps — plug directly into <MessagePrimitive.Parts />
// ---------------------------------------------------------------------------

export const userPartComponents = {
  Text: TextPart,
  File: FilePart,
  Image: ImagePart,
} as const;

export const assistantPartComponents = {
  Text: AssistantTextPart,
  Reasoning: ReqReasoningPart,
  Source: SourcePart,
  File: FilePart,
  Image: ImagePart,
  tools: {
    by_name: {
      writeFile: ReqWriteFilePart,
    },
    Fallback: ReqToolCallPart,
  },
} as const;
