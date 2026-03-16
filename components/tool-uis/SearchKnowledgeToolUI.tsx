"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { useEffect } from "react";
import { normalizeToolStatus, type KnowledgeSearchResult } from "@/lib/types";

type Props = {
  args?: { query?: string };
  result?: KnowledgeSearchResult;
  status: "running" | "complete" | "incomplete";
};

function SearchKnowledgeStatus({ args, result, status }: Props) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("reqagent:artifact", {
        detail: {
          kind: "phase",
          tool: "search_knowledge",
          status: status === "running" ? "running" : "complete",
        },
      }),
    );
  }, [status]);

  return (
    <div className="my-3 rounded-2xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
      <div className="flex items-center justify-between gap-3">
        <span>{status === "running" ? `正在检索相关模式：${args?.query ?? "…"}` : "知识检索已完成。"}</span>
        {result ? <span className="text-xs text-amber-100/70">相关度 {(result.relevance * 100).toFixed(0)}%</span> : null}
      </div>
    </div>
  );
}

export const SearchKnowledgeToolUI = makeAssistantToolUI({
  toolName: "search_knowledge",
  render: ({ args, result, status }) => (
    <SearchKnowledgeStatus
      args={args as Props["args"]}
      result={result as KnowledgeSearchResult | undefined}
      status={normalizeToolStatus(status)}
    />
  ),
});
