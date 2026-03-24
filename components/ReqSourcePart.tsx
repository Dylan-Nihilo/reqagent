"use client";

import { useMessagePartSource } from "@assistant-ui/react";
import { ReqMessageSourceList } from "@/components/message-ui/ReqMessageUI";

export function ReqSourcePart() {
  const { title, url } = useMessagePartSource();

  return <ReqMessageSourceList items={[{ title, url }]} />;
}
