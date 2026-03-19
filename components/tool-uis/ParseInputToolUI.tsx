"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { ReqAgentToolCard } from "@/components/ReqAgentToolCard";
import { normalizeToolStatus, type StructuredRequirement } from "@/lib/types";

type Props = {
  result?: StructuredRequirement;
  status: "running" | "complete" | "incomplete";
};

function ParseInputStatus({ result, status }: Props) {
  const summary =
    status === "running"
      ? "正在把原始需求整理成结构化 brief。"
      : status === "incomplete"
        ? "输入解析已中断，结构化 brief 尚未完整产出。"
        : result
          ? `已识别 ${result.projectName} 的核心角色、能力和歧义点。`
          : "输入解析已完成。";

  return (
    <ReqAgentToolCard
      description="把原始需求转换成结构化 brief，供下游 Agent 继续拆解。"
      metrics={
        result
          ? [
              { label: "project", value: result.projectName },
              { label: "users", value: String(result.targetUsers.length) },
              { label: "ambiguities", value: String(result.ambiguities.length) },
            ]
          : undefined
      }
      name="parse_input"
      status={status}
      summary={summary}
    />
  );
}

export const ParseInputToolUI = makeAssistantToolUI({
  toolName: "parse_input",
  render: ({ result, status }) => (
    <ParseInputStatus result={result as StructuredRequirement | undefined} status={normalizeToolStatus(status)} />
  ),
});
