"use client";

import Link from "next/link";
import { useState } from "react";
import { ReqComposer } from "@/components/ReqComposer";
import { ReqEmptyState } from "@/components/ReqEmptyState";
import { ReqMessage } from "@/components/ReqMessage";
import primitives from "@/components/ReqAgentPrimitives.module.css";
import workbench from "@/components/ReqAgentWorkbench.module.css";
import styles from "./impeccable-preview-v2.module.css";

type ToolState = "pending" | "running" | "streaming" | "success" | "error";
type ReasoningState = "running" | "success" | "error";

type ToolMetric = {
  label: string;
  value: string;
};

type ToolItem = {
  id: string;
  name: string;
  state: ToolState;
  statusLabel: string;
  description: string;
  summary: string;
  metrics: ToolMetric[];
  detail?: string;
  defaultOpen?: boolean;
};

type ReasoningItem = {
  id: string;
  title: string;
  state: ReasoningState;
  elapsedLabel: string;
  summary: string;
  hints: string[];
  defaultOpen?: boolean;
};

const starterPrompts = [
  "把一段模糊需求整理成结构化 brief，并指出还缺哪些前提。",
  "根据目标用户、业务目标和核心流程，生成第一版用户故事。",
  "把会议纪要压成需求文档，保留风险、依赖和优先级摘要。",
];

const toolStateCopy: Record<ToolState, { badge: string; dotClass: string; badgeClass: string }> = {
  pending: {
    badge: "等待执行",
    dotClass: styles.statusPending,
    badgeClass: styles.toolStatusPending,
  },
  running: {
    badge: "正在执行",
    dotClass: primitives.statusRunning,
    badgeClass: primitives.toolStatusRunning,
  },
  streaming: {
    badge: "输出结果",
    dotClass: styles.statusStreaming,
    badgeClass: styles.toolStatusStreaming,
  },
  success: {
    badge: "已完成",
    dotClass: primitives.statusComplete,
    badgeClass: primitives.toolStatusComplete,
  },
  error: {
    badge: "已中断",
    dotClass: primitives.statusIncomplete,
    badgeClass: primitives.toolStatusIncomplete,
  },
};

const reasoningStateCopy: Record<ReasoningState, { label: string; chipClass: string }> = {
  running: { label: "进行中", chipClass: styles.reasoningChipRunning },
  success: { label: "已完成", chipClass: styles.reasoningChipSuccess },
  error: { label: "已中断", chipClass: styles.reasoningChipError },
};

const reasoningItems: ReasoningItem[] = [
  {
    id: "reasoning-1",
    title: "系统判断当前输入是否足够进入拆解",
    state: "success",
    elapsedLabel: "1.2s",
    summary: "已完成 · 当前信息已经足够先形成 brief，不必继续空转追问。",
    hints: ["判断模块", "需求充分度", "下一步是 parse"],
  },
  {
    id: "reasoning-2",
    title: "系统整理角色、范围和约束边界",
    state: "running",
    elapsedLabel: "0.8s",
    summary: "进行中 · 正在把学生、家长、教研和运营视角整理成统一结构。",
    hints: ["角色映射", "范围收敛", "约束补齐"],
    defaultOpen: true,
  },
];

const toolItems: ToolItem[] = [
  {
    id: "tool-1",
    name: "search_knowledge",
    state: "pending",
    statusLabel: "知识模式检索",
    description: "等待前置判断完成后，检索教育场景的常见产品模式。",
    summary: "已排队，将优先补足课程、作业、反馈闭环与家长协同。",
    metrics: [
      { label: "领域", value: "教育平台" },
      { label: "优先级", value: "高" },
    ],
    defaultOpen: true,
  },
  {
    id: "tool-2",
    name: "generate_stories",
    state: "streaming",
    statusLabel: "用户故事生成",
    description: "正在写入第一版 stories，并同步整理验收标准。",
    summary: "正在产出 6 条故事，Must / Should 比例已经稳定。",
    detail: "当前版本先保留核心角色和主流程，不在这一轮提前铺太多边缘功能。",
    metrics: [
      { label: "当前条数", value: "6" },
      { label: "Must", value: "2" },
      { label: "Should", value: "3" },
      { label: "Could", value: "1" },
    ],
    defaultOpen: true,
  },
  {
    id: "tool-3",
    name: "generate_doc",
    state: "success",
    statusLabel: "需求文档生成",
    description: "已整理成领导可读的结构化文档。",
    summary: "文档已生成，包含项目概述、角色范围、风险与优先级摘要。",
    detail: "默认收起已完成项，目的是让主对话始终保持可读，而不是被细节卡片淹没。",
    metrics: [
      { label: "章节", value: "8" },
      { label: "字符", value: "2,480" },
      { label: "状态", value: "可继续迭代" },
    ],
  },
  {
    id: "tool-4",
    name: "generate_doc",
    state: "error",
    statusLabel: "需求文档生成",
    description: "本轮中断不是模型失败，而是输入约束不够完整。",
    summary: "文档生成被中断，建议先补支付角色和权限继承规则。",
    detail: "如果要继续生成完整规格，至少还缺两条业务前提：谁能发起支付，以及班级/家长权限如何继承。",
    metrics: [
      { label: "缺口", value: "支付 / 权限" },
      { label: "建议动作", value: "补两条约束" },
    ],
    defaultOpen: true,
  },
];

export function PreviewRouteV2() {
  return (
    <main className={workbench.page}>
      <div className={workbench.shell}>
        <div className={styles.routeChrome}>
          <span className={primitives.emptyMark}>ReqAgent v2</span>
          <div className={styles.routeLinks}>
            <Link className={styles.routeLink} href="/">
              当前首页
            </Link>
            <Link className={styles.routeLink} href="/impeccable-preview">
              预览 v1
            </Link>
            <Link className={styles.routeLink} href="/gallery">
              组件画廊
            </Link>
          </div>
        </div>

        <section className={styles.landingSection}>
          <ReqEmptyState
            title="把模糊需求压成可执行结构"
            description="这版预览不换产品语言，只把当前工作台里最影响判断和阅读的几处过程 UI 做顺。"
          >
            <div className={styles.emptyStateStack}>
              <ReqComposer
                hint="示例输入，仅展示"
                placeholder="描述产品目标、用户、核心流程和约束……"
                preview
                previewValue="我们要做一个面向 K12 家长和学生的在线教育平台，第一版重点是课程、直播、作业和学习反馈。"
                variant="landing"
              />

              <div className={styles.promptRail}>
                {starterPrompts.map((prompt, index) => (
                  <button key={prompt} className={styles.promptChip} type="button">
                    <span className={styles.promptChipIndex}>0{index + 1}</span>
                    <span className={styles.promptChipText}>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </ReqEmptyState>
        </section>

        <section className={workbench.previewWorkbenchNoArtifacts}>
          <aside className={`${workbench.previewSidebar} ${styles.sidebar}`}>
            <div className={styles.sidebarSection}>
              <p className={styles.sidebarKicker}>预览重点</p>
              <h2 className={styles.sidebarTitle}>沿用当前语言，只重做过程层。</h2>
            </div>

            <div className={styles.sidebarSection}>
              <p className={styles.sidebarBody}>
                当前主线的问题不是主消息，而是工具卡和 reasoning 完成后仍像调试输出。
                这版只沿着现有 `Req*` 视觉系统做 5 个修正。
              </p>
            </div>

            <ul className={styles.sidebarList}>
              <li>工具状态拆成五档，不再只剩“运行中”。</li>
              <li>已完成工具默认折叠成摘要行，点击再展开。</li>
              <li>已完成 reasoning 默认收起，保留过程但不抢主内容。</li>
              <li>所有操作状态改成中文工作语言。</li>
              <li>主消息和过程 UI 的层级明显拉开。</li>
            </ul>
          </aside>

          <section className={`${workbench.previewChat} ${styles.previewChat}`}>
            <div className={styles.threadLabelRow}>
              <span className={primitives.drawerPill}>当前线程</span>
              <p className={styles.threadMeta}>当前示例展示的是一轮从输入到 stories / 文档的过程。</p>
            </div>

            <ReqMessage role="user">
              我想先把在线教育平台的第一版需求整理出来，重点是课程交付、直播、作业、学习反馈和家长协同。
            </ReqMessage>

            <ReqMessage role="assistant">
              当前信息已经足够开始。我会先形成结构化版本，再把支付和权限边界作为需要补齐的风险项保留下来，不阻塞这一轮产出。
            </ReqMessage>

            <div className={styles.processStack}>
              {reasoningItems.map((item) => (
                <PreviewReasoningCard key={item.id} item={item} />
              ))}
            </div>

            <div className={styles.processStack}>
              {toolItems.map((item) => (
                <PreviewToolCard key={item.id} item={item} />
              ))}
            </div>

            <ReqMessage role="assistant">
              <div className={styles.finalSummary}>
                <p className={styles.finalLead}>这一轮的主要结论有三条：</p>
                <ul className={styles.finalList}>
                  <li>brief 和 stories 可以继续推进，不必停在澄清阶段。</li>
                  <li>工具过程保留可见，但完成后默认降噪，让主回复更清楚。</li>
                  <li>最值得你立即补的前提，是支付角色和权限继承规则。</li>
                </ul>
              </div>
            </ReqMessage>

            <div className={styles.composerFoot}>
              <ReqComposer
                hint="预览模式"
                placeholder="继续补充限制条件、目标用户、业务规则……"
                preview
                previewValue="接下来请把这版需求整理成结构化 brief，再给我第一版 stories。"
                variant="thread"
              />
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function PreviewReasoningCard({ item }: { item: ReasoningItem }) {
  const [open, setOpen] = useState(item.defaultOpen ?? item.state !== "success");
  const stateMeta = reasoningStateCopy[item.state];
  const completed = item.state === "success";
  const failed = item.state === "error";

  if (!open) {
    return (
      <button className={`${primitives.thinkingChip} ${styles.processChip}`} onClick={() => setOpen(true)} type="button">
        <span className={`${primitives.thinkingChipLabel} ${stateMeta.chipClass}`}>{stateMeta.label}</span>
        <span className={primitives.thinkingChipSummary}>{item.title}</span>
        <span className={primitives.thinkingElapsed}>{item.elapsedLabel}</span>
      </button>
    );
  }

  return (
    <section
      className={`${primitives.thinkingCard} ${completed ? primitives.thinkingCardCompleted : ""} ${failed ? primitives.thinkingCardFailed : ""} ${styles.processCard}`}
    >
      <button className={primitives.thinkingToggle} onClick={() => setOpen(false)} type="button">
        <div className={primitives.thinkingHead}>
          <span className={`${primitives.thinkingLabel} ${styles.reasoningLabel}`}>{stateMeta.label}</span>
          <span className={primitives.thinkingAgent}>需求判断</span>
        </div>
        <div className={primitives.thinkingMeta}>
          <span className={primitives.thinkingElapsed}>{item.elapsedLabel}</span>
          <span className={primitives.thinkingChevronOpen}>▾</span>
        </div>
      </button>

      <div className={primitives.thinkingContent}>
        <p className={primitives.thinkingSummary}>{item.summary}</p>
        <div className={primitives.thinkingHints}>
          {item.hints.map((hint) => (
            <span key={hint} className={primitives.thinkingHint}>
              {hint}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewToolCard({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(item.defaultOpen ?? item.state !== "success");
  const stateMeta = toolStateCopy[item.state];

  return (
    <article className={`${primitives.toolCard} ${styles.toolCard} ${styles[`toolCard${capitalize(item.state)}`]}`}>
      <button className={styles.toolButton} onClick={() => setOpen((value) => !value)} type="button">
        <div className={primitives.toolHead}>
          <div className={primitives.toolDotWrap}>
            <div className={`${primitives.toolDot} ${stateMeta.dotClass}`} />
          </div>

          <div className={primitives.toolMeta}>
            <div className={primitives.toolTitleRow}>
              <p className={primitives.toolName}>{item.statusLabel}</p>
              <span className={`${primitives.toolStatus} ${stateMeta.badgeClass}`}>{stateMeta.badge}</span>
              {item.state === "success" ? (
                <span className={styles.compactMark}>{open ? "收起细节" : "查看细节"}</span>
              ) : null}
            </div>

            <p className={primitives.toolDescription}>{item.description}</p>
            <p className={primitives.toolSummary}>{item.summary}</p>
          </div>

          <span className={`${styles.toolChevron} ${open ? styles.toolChevronOpen : ""}`}>▾</span>
        </div>
      </button>

      <div className={`${styles.toolExpandable} ${open ? styles.toolExpandableOpen : ""}`}>
        <div className={styles.toolExpandableInner}>
          {item.detail ? <p className={styles.toolDetail}>{item.detail}</p> : null}

          <div className={primitives.toolDataGrid}>
            {item.metrics.map((metric) => (
              <div key={`${item.id}-${metric.label}`} className={primitives.toolDataItem}>
                <span className={primitives.toolDataLabel}>{metric.label}</span>
                <span className={primitives.toolDataValue}>{metric.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
