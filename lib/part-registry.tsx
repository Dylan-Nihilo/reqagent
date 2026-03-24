"use client";

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
  useMessagePartText,
  useMessagePartFile,
  useMessagePartImage,
  useMessagePartSource,
} from "@assistant-ui/react";
import {
  ReqMessageMarkdownPreview,
  ReqMessageFileTile,
  ReqMessageImageTile,
  ReqMessageSourceList,
  estimateDataSizeLabel,
} from "@/components/message-ui/ReqMessageUI";
import { ReqReasoningPart } from "@/components/ReqReasoningPart";
import { ReqToolCallPart } from "@/components/ReqToolCallPart";

// ---------------------------------------------------------------------------
// Inline part adapters (hook → display, no extra logic)
// ---------------------------------------------------------------------------

function TextPart() {
  const { text, status } = useMessagePartText();
  return <ReqMessageMarkdownPreview markdown={text} streaming={status.type === "running"} />;
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
  Text: TextPart,
  Reasoning: ReqReasoningPart,
  Source: SourcePart,
  File: FilePart,
  Image: ImagePart,
  tools: {
    Fallback: ReqToolCallPart,
  },
} as const;
