"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { ReqAgentToolCard } from "@/components/ReqAgentToolCard";
import { normalizeToolStatus, type StoryGenerationResult } from "@/lib/types";

type Props = {
  result?: StoryGenerationResult;
  status: "running" | "complete" | "incomplete";
};

function GenerateStoriesStatus({ result, status }: Props) {
  return (
    <ReqAgentToolCard
      description="按 Must / Should / Could 生成用户故事与验收标准。"
      metrics={
        result
          ? [
              { label: "total", value: String(result.total) },
              { label: "must", value: String(result.summary.must) },
              { label: "should", value: String(result.summary.should) },
              { label: "could", value: String(result.summary.could) },
            ]
          : undefined
      }
      name="generate_stories"
      status={status}
      summary={
        status === "running"
          ? "正在展开优先级明确的用户故事，完成后会加入右侧产物列表。"
          : status === "incomplete"
            ? "用户故事生成已中断。"
            : result
              ? `${result.projectName} 的 stories 已生成，右侧产物已更新。`
              : "用户故事生成已完成。"
      }
    />
  );
}

export const GenerateStoriesToolUI = makeAssistantToolUI({
  toolName: "generate_stories",
  render: ({ result, status }) => (
    <GenerateStoriesStatus result={result as StoryGenerationResult | undefined} status={normalizeToolStatus(status)} />
  ),
});
