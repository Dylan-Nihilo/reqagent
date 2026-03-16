"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { useEffect } from "react";
import { normalizeToolStatus, type DocumentGenerationResult } from "@/lib/types";

type Props = {
  result?: DocumentGenerationResult;
  status: "running" | "complete" | "incomplete";
};

function GenerateDocStatus({ result, status }: Props) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("reqagent:artifact", {
        detail: {
          kind: "phase",
          tool: "generate_doc",
          status: status === "running" ? "running" : "complete",
        },
      }),
    );

    if (result) {
      window.dispatchEvent(
        new CustomEvent("reqagent:artifact", {
          detail: {
            kind: "doc",
            payload: result,
          },
        }),
      );
    }
  }, [result, status]);

  if (status === "running") {
    return <div className="my-3 rounded-2xl border border-indigo-300/15 bg-indigo-300/10 px-4 py-3 text-sm text-indigo-50">正在生成需求文档草稿…</div>;
  }

  if (!result) {
    return null;
  }

  return (
    <div className="my-3 rounded-[22px] border border-indigo-300/15 bg-[rgba(99,102,241,0.08)] p-4 text-sm text-indigo-50">
      <div className="flex items-center justify-between gap-3">
        <span>{result.projectName} 的需求文档已生成</span>
        <span className="text-xs text-indigo-100/70">{result.charCount} 字符</span>
      </div>
      <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/8 bg-[rgba(3,13,18,0.62)] p-3 text-xs leading-6 text-slate-100">
        {result.content}
      </pre>
    </div>
  );
}

export const GenerateDocToolUI = makeAssistantToolUI({
  toolName: "generate_doc",
  render: ({ result, status }) => (
    <GenerateDocStatus result={result as DocumentGenerationResult | undefined} status={normalizeToolStatus(status)} />
  ),
});
