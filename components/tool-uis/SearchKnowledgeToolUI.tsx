"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { ReqAgentToolCard } from "@/components/ReqAgentToolCard";
import { normalizeToolStatus, type KnowledgeSearchResult } from "@/lib/types";

type Props = {
  args?: { query?: string };
  result?: KnowledgeSearchResult;
  status: "running" | "complete" | "incomplete";
};

function SearchKnowledgeStatus({ args, result, status }: Props) {
  const summary =
    status === "running"
      ? `正在检索相关模式：${args?.query ?? "当前需求"}`
      : status === "incomplete"
        ? "知识模式检索已中断。"
        : result
          ? "相关模式已返回，ReqDecomposer 可以继续展开 stories。"
          : "知识模式检索已完成。";

  return (
    <ReqAgentToolCard
      description="匹配领域模式和最佳实践，给 stories 生成提供参考基线。"
      metrics={
        result
          ? [
              { label: "query", value: args?.query ?? "n/a" },
              { label: "source", value: result.source },
              { label: "relevance", value: `${(result.relevance * 100).toFixed(0)}%` },
            ]
          : args?.query
            ? [{ label: "query", value: args.query }]
            : undefined
      }
      name="search_knowledge"
      status={status}
      summary={summary}
    />
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
