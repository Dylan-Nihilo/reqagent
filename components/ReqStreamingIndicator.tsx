"use client";

import { ReqMessagePendingLine } from "@/components/message-ui/ReqMessageUI";

export function ReqStreamingIndicator({
  label,
  phases,
}: {
  label: string;
  phases?: string[];
}) {
  return <ReqMessagePendingLine label={label} phases={phases} />;
}
