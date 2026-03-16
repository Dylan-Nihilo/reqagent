"use client";

import type { ArtifactState } from "@/lib/types";

type ArtifactPanelProps = {
  artifacts: ArtifactState;
  onTabChange: (tab: ArtifactState["activeTab"]) => void;
  className?: string;
};

const tabs: Array<{ id: ArtifactState["activeTab"]; label: string; hint: string }> = [
  { id: "stories", label: "用户故事", hint: "按优先级拆解的 Story" },
  { id: "doc", label: "需求文档", hint: "Markdown 规格初稿" },
  { id: "notes", label: "说明", hint: "MVP 实现与限制" },
];

export function ArtifactPanel({ artifacts, onTabChange, className = "" }: ArtifactPanelProps) {
  return (
    <aside className={["flex min-h-[42vh] flex-col bg-[rgba(7,20,28,0.92)]", className].join(" ").trim()}>
      <div className="border-b border-white/10 px-5 py-4 md:px-6">
        <p className="text-sm font-medium text-[var(--text)]">产出物</p>
        <p className="mt-1 text-sm text-[var(--muted)]">这里会同步展示工具产出的结构化结果。</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-white/10 px-5 py-4 md:px-6">
        {tabs.map((tab) => {
          const active = tab.id === artifacts.activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={[
                "rounded-full border px-3 py-2 text-left text-xs transition",
                active
                  ? "border-sky-300/30 bg-sky-300/10 text-sky-100"
                  : "border-white/10 bg-white/5 text-[var(--muted)] hover:border-white/20 hover:text-white",
              ].join(" ")}
            >
              <span className="block font-medium uppercase tracking-[0.18em]">{tab.label}</span>
              <span className="mt-1 block text-[11px] normal-case tracking-normal">{tab.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="artifact-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6">
        {artifacts.activeTab === "stories" && <StoriesView artifacts={artifacts} />}
        {artifacts.activeTab === "doc" && <DocumentView artifacts={artifacts} />}
        {artifacts.activeTab === "notes" && <NotesView />}
      </div>
    </aside>
  );
}

function StoriesView({ artifacts }: { artifacts: ArtifactState }) {
  if (!artifacts.stories) {
    return <EmptyState title="还没有用户故事" body="完成需求拆解之后，这里会出现 Story 看板。" />;
  }

  const columns = ["must", "should", "could"] as const;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {columns.map((priority) => {
        const stories = artifacts.stories?.stories.filter((story) => story.priority === priority) ?? [];

        return (
          <section key={priority} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text)]">{priority === "must" ? "必须" : priority === "should" ? "应该" : "可选"}</h3>
              <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] text-[var(--muted)]">
                {stories.length} 条
              </span>
            </div>
            <div className="space-y-3">
              {stories.map((story) => (
                <article key={story.id} className="rounded-2xl border border-white/10 bg-[rgba(3,13,18,0.8)] p-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-teal-200">{story.id}</p>
                  <p className="mt-2 text-sm leading-6 text-white">作为 {story.role}，我希望 {story.want}</p>
                  <p className="mt-2 text-sm text-[var(--muted)]">这样可以 {story.soThat}</p>
                  <div className="mt-3 rounded-xl border border-white/8 bg-white/4 p-3">
                    <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">验收标准</p>
                    <ul className="space-y-2 text-sm text-slate-100">
                      {story.acceptanceCriteria.map((criterion) => (
                        <li key={criterion}>{criterion}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DocumentView({ artifacts }: { artifacts: ArtifactState }) {
  if (!artifacts.doc) {
    return <EmptyState title="还没有需求文档" body="文档生成完成后，这里会展示 Markdown 初稿。" />;
  }

  return (
    <section className="rounded-[24px] border border-white/10 bg-[rgba(3,13,18,0.72)] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">需求文档草稿</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{artifacts.doc.projectName}</h3>
        </div>
        <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-[var(--muted)]">
          {artifacts.doc.charCount} 字符
        </div>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-7 text-slate-100">{artifacts.doc.content}</pre>
    </section>
  );
}

function NotesView() {
  return (
    <section className="space-y-4 rounded-[24px] border border-white/10 bg-[rgba(3,13,18,0.72)] p-5 text-sm text-slate-100">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">当前形态</p>
        <p className="mt-2 leading-7 text-[var(--text)]">
          这一版实现的是可运行的需求分析 MVP：单模型流式输出、显式工具阶段、以及 assistant-ui 驱动的工作台界面。真正的多代理 handoff 暂时没有落进这一版。
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">后续项</p>
        <ul className="mt-2 space-y-2 leading-7 text-[var(--muted)]">
          <li>通过 `@openai/agents` 补上真正的 handoff 和可视化</li>
          <li>补附件解析与基于文件系统的上传链路</li>
          <li>补产出物持久化、导出和多轮编辑控制</li>
        </ul>
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/4 p-6 text-center">
      <div className="max-w-sm">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{body}</p>
      </div>
    </div>
  );
}
