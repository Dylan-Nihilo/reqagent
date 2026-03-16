"use client";

import type { PipelineState, ReqAgentPhase } from "@/lib/types";

type PipelineBarProps = {
  pipeline: PipelineState;
};

const steps: Array<{ tool: ReqAgentPhase; label: string }> = [
  { tool: "parse_input", label: "解析输入" },
  { tool: "search_knowledge", label: "知识检索" },
  { tool: "generate_stories", label: "生成故事" },
  { tool: "generate_doc", label: "生成文档" },
];

export function PipelineBar({ pipeline }: PipelineBarProps) {
  const statusLabel = {
    idle: "未开始",
    running: "进行中",
    complete: "完成",
    incomplete: "中断",
  } as const;

  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-[rgba(12,17,24,0.94)] px-5 py-4 md:px-6">
      <span className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">执行链路</span>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {steps.map((step) => {
          const status = pipeline[step.tool];
          return (
            <div
              key={step.tool}
              className={[
                "rounded-full border px-3 py-2 text-xs uppercase tracking-[0.16em] transition",
                status === "running"
                  ? "border-amber-300/30 bg-amber-300/12 text-amber-100"
                  : status === "complete"
                    ? "border-sky-300/30 bg-sky-300/12 text-sky-100"
                    : "border-white/10 bg-white/4 text-[var(--muted)]",
              ].join(" ")}
            >
              {step.label} / {statusLabel[status]}
            </div>
          );
        })}
      </div>
    </footer>
  );
}
