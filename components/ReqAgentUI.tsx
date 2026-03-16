"use client";

import { ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { useEffect, useState } from "react";
import { ArtifactPanel } from "@/components/ArtifactPanel";
import { PipelineBar } from "@/components/PipelineBar";
import { GenerateDocToolUI } from "@/components/tool-uis/GenerateDocToolUI";
import { GenerateStoriesToolUI } from "@/components/tool-uis/GenerateStoriesToolUI";
import { ParseInputToolUI } from "@/components/tool-uis/ParseInputToolUI";
import { SearchKnowledgeToolUI } from "@/components/tool-uis/SearchKnowledgeToolUI";
import type { ArtifactState, PipelineState, ReqAgentArtifactEvent } from "@/lib/types";

const INITIAL_PIPELINE: PipelineState = {
  parse_input: "idle",
  search_knowledge: "idle",
  generate_stories: "idle",
  generate_doc: "idle",
};

const INITIAL_ARTIFACTS: ArtifactState = {
  activeTab: "stories",
};

export function ReqAgentUI() {
  const [artifacts, setArtifacts] = useState<ArtifactState>(INITIAL_ARTIFACTS);
  const [pipeline, setPipeline] = useState<PipelineState>(INITIAL_PIPELINE);
  const [mobilePanel, setMobilePanel] = useState<"chat" | "artifacts">("chat");

  useEffect(() => {
    const handleArtifact = (event: Event) => {
      const detail = (event as CustomEvent<ReqAgentArtifactEvent>).detail;

      if (detail.kind === "stories") {
        setArtifacts((current) => ({ ...current, stories: detail.payload, activeTab: "stories" }));
        setMobilePanel("artifacts");
      }

      if (detail.kind === "doc") {
        setArtifacts((current) => ({ ...current, doc: detail.payload, activeTab: "doc" }));
        setMobilePanel("artifacts");
      }

      if (detail.kind === "phase") {
        setPipeline((current) => ({ ...current, [detail.tool]: detail.status }));
      }
    };

    window.addEventListener("reqagent:artifact", handleArtifact);
    return () => window.removeEventListener("reqagent:artifact", handleArtifact);
  }, []);

  const setActiveTab = (tab: ArtifactState["activeTab"]) => {
    setArtifacts((current) => ({ ...current, activeTab: tab }));
  };

  return (
    <main className="relative min-h-dvh overflow-hidden px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-7xl flex-col overflow-hidden rounded-[24px] border border-white/10 glass sm:min-h-[calc(100dvh-2rem)] sm:rounded-[28px] md:min-h-[calc(100dvh-3rem)]">
        <header className="border-b border-white/10 px-4 py-4 sm:px-5 md:px-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#60a5fa,#818cf8)] font-mono text-sm font-semibold text-slate-950">
                  RA
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">ReqAgent MVP</p>
                  <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">需求拆解工作台</h1>
                </div>
              </div>
              <p className="max-w-3xl text-sm text-[var(--muted)] md:text-base">
                这是一版可运行的需求分析 MVP。它先通过单代理工作流完成输入解析、需求拆解与文档生成，真正的多代理 handoff 放到后续阶段再做。
              </p>
            </div>
            <div className="rounded-full border border-sky-300/20 bg-sky-400/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-sky-200">
              MVP / 单代理
            </div>
          </div>
        </header>

        <div className="border-b border-white/10 bg-[rgba(4,14,20,0.74)] px-4 py-3 lg:hidden">
          <div className="grid grid-cols-2 gap-2 rounded-[18px] border border-white/10 bg-white/5 p-1">
            {[
              { id: "chat", label: "对话" },
              { id: "artifacts", label: "产出物" },
            ].map((panel) => {
              const active = mobilePanel === panel.id;

              return (
                <button
                  key={panel.id}
                  type="button"
                  onClick={() => setMobilePanel(panel.id as "chat" | "artifacts")}
                  className={[
                    "rounded-[14px] px-3 py-2 text-sm font-medium transition",
                    active
                      ? "bg-[linear-gradient(135deg,rgba(96,165,250,0.18),rgba(129,140,248,0.18))] text-white"
                      : "text-[var(--muted)]",
                  ].join(" ")}
                >
                  {panel.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid flex-1 gap-px bg-white/8 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <section
            className={[
              "min-h-[52vh] flex-col bg-[rgba(4,14,20,0.68)] lg:flex",
              mobilePanel === "chat" ? "flex" : "hidden",
            ].join(" ")}
          >
            <div className="border-b border-white/10 px-4 py-4 sm:px-5 md:px-6">
              <p className="text-sm font-medium text-[var(--text)]">需求对话</p>
              <p className="mt-1 text-sm text-[var(--muted)]">输入你的产品想法，ReqAgent 会追问、拆解并生成初稿。</p>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-2 py-2 sm:px-3">
              <ToolRegistry />
              <ThreadPrimitive.Root className="flex h-full min-h-[44vh] flex-col rounded-[20px] border border-white/10 bg-[rgba(7,19,26,0.68)] sm:rounded-[22px]">
                <ThreadPrimitive.Viewport className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">
                  <ThreadPrimitive.Empty>
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-white/4 p-6 text-sm leading-7 text-[var(--muted)]">
                      从一段产品需求开始。ReqAgent 会先解析输入，再检索相似模式，接着生成用户故事与需求文档草稿。
                    </div>
                  </ThreadPrimitive.Empty>
                  <ThreadPrimitive.Messages
                    components={{
                      UserMessage,
                      AssistantMessage,
                    }}
                  />
                </ThreadPrimitive.Viewport>
              </ThreadPrimitive.Root>
            </div>
            <div className="border-t border-white/10 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4">
              <ComposerPrimitive.Root className="rounded-[20px] border border-white/10 bg-[rgba(4,15,22,0.95)] p-3 sm:rounded-[22px]">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <ComposerPrimitive.Input
                    rows={3}
                    placeholder="描述产品目标、用户角色、核心功能和约束条件……"
                    className="min-h-24 w-full flex-1 resize-none border-0 bg-transparent px-2 py-1 text-sm leading-6 text-white outline-none placeholder:text-[var(--muted)]"
                  />
                  <ComposerPrimitive.Send className="w-full rounded-full bg-[linear-gradient(135deg,#60a5fa,#818cf8)] px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-90 sm:w-auto sm:py-2">
                    发送
                  </ComposerPrimitive.Send>
                </div>
              </ComposerPrimitive.Root>
            </div>
          </section>

          <ArtifactPanel
            artifacts={artifacts}
            onTabChange={setActiveTab}
            className={[
              "lg:flex",
              mobilePanel === "artifacts" ? "flex" : "hidden",
            ].join(" ")}
          />
        </div>

        <PipelineBar pipeline={pipeline} />
      </div>
    </main>
  );
}

function ToolRegistry() {
  return (
    <>
      <ParseInputToolUI />
      <SearchKnowledgeToolUI />
      <GenerateStoriesToolUI />
      <GenerateDocToolUI />
    </>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[92%] rounded-[24px] rounded-br-md bg-[linear-gradient(135deg,rgba(96,165,250,0.22),rgba(129,140,248,0.18))] px-4 py-3 text-sm leading-7 text-white shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:max-w-[85%]">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-start">
      <div className="max-w-[94%] rounded-[24px] rounded-bl-md border border-white/10 bg-[rgba(10,30,39,0.96)] px-4 py-3 text-sm leading-7 text-slate-100 shadow-[0_18px_60px_rgba(0,0,0,0.16)] sm:max-w-[90%]">
        <MessagePrimitive.Parts
          components={{
            tools: {
              by_name: {
                parse_input: ParseInputToolUI,
                search_knowledge: SearchKnowledgeToolUI,
                generate_stories: GenerateStoriesToolUI,
                generate_doc: GenerateDocToolUI,
              },
            },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}
