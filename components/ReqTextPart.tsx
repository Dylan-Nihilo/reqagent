"use client";

import { useMessagePartText } from "@assistant-ui/react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Custom text part renderer for assistant messages.
 *
 * Replaces assistant-ui's default text component (which only does
 * `whiteSpace: pre-line` and a "●" streaming cursor) with a
 * react-markdown renderer that supports GFM (tables, strikethrough, etc.).
 */
export function ReqTextPart() {
  const { text } = useMessagePartText();

  return <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>;
}
