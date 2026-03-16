"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { useEffect } from "react";
import { normalizeToolStatus } from "@/lib/types";

type Props = {
  status: "running" | "complete" | "incomplete";
};

function ParseInputStatus({ status }: Props) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("reqagent:artifact", {
        detail: {
          kind: "phase",
          tool: "parse_input",
          status: status === "running" ? "running" : "complete",
        },
      }),
    );
  }, [status]);

  return (
    <div className="my-3 rounded-2xl border border-sky-300/15 bg-sky-300/10 px-4 py-3 text-sm text-sky-100">
      {status === "running" ? "正在解析需求输入…" : "输入解析已完成。"}
    </div>
  );
}

export const ParseInputToolUI = makeAssistantToolUI({
  toolName: "parse_input",
  render: ({ status }) => <ParseInputStatus status={normalizeToolStatus(status)} />,
});
