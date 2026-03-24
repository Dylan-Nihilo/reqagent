"use client";

import { useMessagePartText } from "@assistant-ui/react";
import { ReqMessageMarkdownPreview } from "@/components/message-ui/ReqMessageUI";

export function ReqTextPart() {
  const { text, status } = useMessagePartText();

  return <ReqMessageMarkdownPreview markdown={text} streaming={status.type === "running"} />;
}
