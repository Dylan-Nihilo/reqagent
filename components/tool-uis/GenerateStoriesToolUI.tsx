"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { useEffect } from "react";
import { normalizeToolStatus, type StoryGenerationResult } from "@/lib/types";

type Props = {
  result?: StoryGenerationResult;
  status: "running" | "complete" | "incomplete";
};

function GenerateStoriesStatus({ result, status }: Props) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("reqagent:artifact", {
        detail: {
          kind: "phase",
          tool: "generate_stories",
          status: status === "running" ? "running" : "complete",
        },
      }),
    );

    if (result) {
      window.dispatchEvent(
        new CustomEvent("reqagent:artifact", {
          detail: {
            kind: "stories",
            payload: result,
          },
        }),
      );
    }
  }, [result, status]);

  if (status === "running") {
    return <div className="my-3 rounded-2xl border border-sky-300/15 bg-sky-300/10 px-4 py-3 text-sm text-sky-50">正在生成按优先级拆解的用户故事…</div>;
  }

  if (!result) {
    return null;
  }

  return (
    <div className="my-3 rounded-[22px] border border-sky-300/15 bg-[rgba(59,130,246,0.10)] p-4 text-sm text-sky-50">
      <div className="flex items-center justify-between gap-3">
        <span>{result.projectName} 的用户故事已生成</span>
        <span className="text-xs text-sky-100/70">共 {result.total} 条</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-sky-300/15 px-2 py-1">必须 {result.summary.must}</span>
        <span className="rounded-full border border-sky-300/15 px-2 py-1">应该 {result.summary.should}</span>
        <span className="rounded-full border border-sky-300/15 px-2 py-1">可选 {result.summary.could}</span>
      </div>
    </div>
  );
}

export const GenerateStoriesToolUI = makeAssistantToolUI({
  toolName: "generate_stories",
  render: ({ result, status }) => (
    <GenerateStoriesStatus result={result as StoryGenerationResult | undefined} status={normalizeToolStatus(status)} />
  ),
});
