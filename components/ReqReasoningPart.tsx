"use client";

import { useState } from "react";
import { useMessagePartReasoning } from "@assistant-ui/react";
import { ReqThinkingBlock } from "@/components/ReqThinkingBlock";

/**
 * Bridges assistant-ui's reasoning message part → ReqThinkingBlock.
 *
 * Registered as `components.Reasoning` in MessagePrimitive.Parts so that
 * any model reasoning tokens are automatically rendered via the shared
 * thinking block component.
 */
export function ReqReasoningPart() {
  const reasoning = useMessagePartReasoning();
  const [open, setOpen] = useState(true);

  const mode = statusToMode(reasoning.status);

  return (
    <ReqThinkingBlock
      agent="Agent"
      elapsedLabel={mode === "running" ? "..." : "done"}
      mode={mode}
      onToggle={() => setOpen((v) => !v)}
      open={open}
      phaseLabel={mode === "running" ? "推理中" : "推理完成"}
      summary={reasoning.text || (mode === "running" ? "正在推理……" : "推理已完成。")}
    />
  );
}

function statusToMode(status: { type: string }): "running" | "completed" | "failed" {
  switch (status.type) {
    case "running":
      return "running";
    case "incomplete":
      return "failed";
    default:
      return "completed";
  }
}
