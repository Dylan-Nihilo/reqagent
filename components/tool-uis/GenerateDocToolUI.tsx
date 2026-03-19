"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { ReqAgentToolCard } from "@/components/ReqAgentToolCard";
import { normalizeToolStatus, type DocumentGenerationResult } from "@/lib/types";

type Props = {
  result?: DocumentGenerationResult;
  status: "running" | "complete" | "incomplete";
};

function GenerateDocStatus({ result, status }: Props) {
  return (
    <ReqAgentToolCard
      description="输出最终 Markdown 需求文档草稿，并同步为文件型产物。"
      metrics={
        result
          ? [
              { label: "project", value: result.projectName },
              { label: "format", value: result.format },
              { label: "chars", value: String(result.charCount) },
            ]
          : undefined
      }
      name="generate_doc"
      status={status}
      summary={
        status === "running"
          ? "正在编写 Markdown 需求文档，完成后右侧会出现新的产物。"
          : status === "incomplete"
            ? "需求文档生成已中断。"
            : result
              ? `${result.projectName} 的文档草稿已生成，右侧产物已更新。`
              : "需求文档生成已完成。"
      }
    />
  );
}

export const GenerateDocToolUI = makeAssistantToolUI({
  toolName: "generate_doc",
  render: ({ result, status }) => (
    <GenerateDocStatus result={result as DocumentGenerationResult | undefined} status={normalizeToolStatus(status)} />
  ),
});
