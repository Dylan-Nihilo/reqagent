"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./impeccable-preview.module.css";

type PreviewToolStatus = "pending" | "running" | "streaming" | "success" | "error";
type PreviewReasoningStatus = "running" | "success" | "error";

type PreviewToolMetric = {
  label: string;
  value: string;
};

type PreviewTool = {
  id: string;
  name: string;
  status: PreviewToolStatus;
  phase: string;
  summary: string;
  detail: string;
  metrics: PreviewToolMetric[];
  defaultExpanded?: boolean;
};

type PreviewReasoning = {
  id: string;
  status: PreviewReasoningStatus;
  title: string;
  summary: string;
  notes: string[];
  defaultExpanded?: boolean;
};

const starterPrompts = [
  "把这段模糊需求整理成结构化 brief，并指出最关键的缺口。",
  "根据目标用户和业务目标，先产出一版用户故事，再补上验收标准。",
  "把会议纪要提炼成可执行需求文档，并标出风险与依赖。",
];

const activityTags = [
  "产品判断",
  "需求拆解",
  "执行可见性",
  "中文工作台",
];

const previewReasoning: PreviewReasoning[] = [
  {
    id: "reasoning-complete",
    status: "success",
    title: "判断输入是否足够进入拆解",
    summary: "已完成 · 当前信息足以先生成 brief，再补齐支付和权限边界。",
    notes: [
      "产品目标和核心角色已经明确，不需要先追问全量细节。",
      "支付路径、权限模型和数据保留策略仍是后续文档里的风险项。",
      "先形成结构化版本，再针对缺口补追问，整体效率更高。",
    ],
  },
  {
    id: "reasoning-running",
    status: "running",
    title: "整理输出结构",
    summary: "进行中 · 正在把角色、约束和验收标准映射到统一格式。",
    notes: [
      "优先输出 brief，再决定是否自动展开 stories。",
      "将对领导视角保留决策摘要，对执行视角保留可交付细节。",
    ],
    defaultExpanded: true,
  },
];

const previewTools: PreviewTool[] = [
  {
    id: "tool-pending",
    name: "知识模式检索",
    status: "pending",
    phase: "等待执行",
    summary: "已排队，准备检索教育平台的常见产品模式。",
    detail: "系统正在等待前置 reasoning 完成，随后会拉取相关领域模式作为拆解基线。",
    metrics: [
      { label: "领域", value: "教育 SaaS" },
      { label: "优先级", value: "高" },
    ],
  },
  {
    id: "tool-running",
    name: "知识模式检索",
    status: "running",
    phase: "正在检索",
    summary: "正在检索课程、作业、家长协同和反馈闭环。",
    detail: "这一阶段会抓出领域里的角色边界、主流程和高风险模块，避免后续 story 拆解偏空。",
    metrics: [
      { label: "检索词", value: "K12 在线教育平台" },
      { label: "来源", value: "模式库" },
    ],
    defaultExpanded: true,
  },
  {
    id: "tool-streaming",
    name: "用户故事生成",
    status: "streaming",
    phase: "输出结果",
    summary: "正在写入 6 条候选故事，Must / Should 比例已收敛。",
    detail: "系统已经确定主角色为学生、家长和运营，正在把 Given / When / Then 验收标准逐条补齐。",
    metrics: [
      { label: "当前条数", value: "6" },
      { label: "Must", value: "2" },
      { label: "Should", value: "3" },
      { label: "Could", value: "1" },
    ],
    defaultExpanded: true,
  },
  {
    id: "tool-success",
    name: "需求文档生成",
    status: "success",
    phase: "已完成",
    summary: "需求文档已生成，包含优先级摘要、风险和流程图。",
    detail: "文档已整理成领导可读的摘要结构，同时保留可继续交付的功能分解、依赖与风险段落。",
    metrics: [
      { label: "章节", value: "8" },
      { label: "字符", value: "2,480" },
      { label: "流程图", value: "1" },
    ],
  },
  {
    id: "tool-error",
    name: "需求文档生成",
    status: "error",
    phase: "已中断",
    summary: "文档生成被中断，缺少支付权限边界，建议先补 2 个前提。",
    detail: "系统没有直接失败在生成能力，而是停在输入约束不完整。先确认付费角色和权限继承方式，再继续会更稳。",
    metrics: [
      { label: "缺口", value: "支付 / 权限" },
      { label: "建议动作", value: "补两条约束" },
    ],
    defaultExpanded: true,
  },
];

const finalAssistantNotes = [
  "当前版本已经足够进入 brief 和 stories 生成，不必继续空转追问。",
  "最值得你立即确认的是支付角色和权限模型，这两项会直接影响文档边界。",
  "如果你点开已完成项，能看到完整过程；默认保持收起，是为了让主对话仍然好读。",
];

const toolStatusMeta: Record<PreviewToolStatus, { label: string; tone: string }> = {
  pending: { label: "等待执行", tone: styles.pending },
  running: { label: "正在执行", tone: styles.running },
  streaming: { label: "输出结果", tone: styles.streaming },
  success: { label: "已完成", tone: styles.success },
  error: { label: "已中断", tone: styles.error },
};

const reasoningStatusMeta: Record<PreviewReasoningStatus, { label: string; tone: string }> = {
  running: { label: "进行中", tone: styles.running },
  success: { label: "已完成", tone: styles.success },
  error: { label: "已中断", tone: styles.error },
};

export function PreviewWorkbench() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div className={styles.brandCluster}>
            <span className={styles.brandMark}>ReqAgent</span>
            <div className={styles.brandCopy}>
              <p className={styles.eyebrow}>Impeccable Preview Route</p>
              <h1 className={styles.title}>更像工作台，而不是演示样板。</h1>
            </div>
          </div>

          <div className={styles.actions}>
            <Link className={styles.ghostLink} href="/">
              返回当前首页
            </Link>
            <Link className={styles.ghostLink} href="/gallery">
              查看组件陈列
            </Link>
          </div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroLead}>
            <p className={styles.kicker}>面向产品经理与负责人</p>
            <p className={styles.heroText}>
              这版预览把重点放在三件事上：主对话更干净，过程状态一眼可辨，已完成步骤默认压缩。
            </p>
          </div>

          <div className={styles.tagRail}>
            {activityTags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </div>
        </section>

        <div className={styles.layout}>
          <section className={styles.startColumn} aria-labelledby="preview-start-title">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>新会话起点</p>
              <h2 className={styles.sectionTitle} id="preview-start-title">
                从一个清晰的起点开始。
              </h2>
            </div>

            <p className={styles.sectionBody}>
              不是“随便聊聊”，而是把模糊输入压到可以继续执行的结构。先给目标，再让系统替你整理路径。
            </p>

            <div className={styles.composer}>
              <p className={styles.composerLabel}>建议输入</p>
              <p className={styles.composerValue}>
                我们要做一个面向 K12 家长和学生的在线教育平台，核心是课程、直播、作业和学习反馈。
              </p>
            </div>

            <div className={styles.starterList}>
              {starterPrompts.map((prompt, index) => (
                <button key={prompt} className={styles.starterButton} type="button">
                  <span className={styles.starterIndex}>0{index + 1}</span>
                  <span className={styles.starterText}>{prompt}</span>
                  <span className={styles.starterArrow}>↗</span>
                </button>
              ))}
            </div>

            <div className={styles.sidebarNote}>
              <p className={styles.sidebarNoteTitle}>这版空状态强调什么</p>
              <ul className={styles.noteList}>
                <li>给可直接开工的任务模板，而不是一句空话。</li>
                <li>保留轻微的编辑性排版，但不靠大卡片堆界面。</li>
                <li>把“高杠杆输入”放在最前面，让角色定位清楚。</li>
              </ul>
            </div>
          </section>

          <section className={styles.threadColumn} aria-labelledby="preview-thread-title">
            <div className={styles.sectionHead}>
              <p className={styles.sectionKicker}>当前执行线程</p>
              <h2 className={styles.sectionTitle} id="preview-thread-title">
                主对话优先，过程默认降噪。
              </h2>
            </div>

            <div className={styles.threadStream}>
              <MessageBubble role="user">
                我想先把在线教育平台的第一版需求整理出来，重点是课程交付、直播、作业、学习反馈和家长协同。
              </MessageBubble>

              <MessageBubble role="assistant">
                可以直接开始。当前信息已经足够先形成结构化 brief，我会把支付和权限边界作为后续风险项标出来，不阻塞这一轮产出。
              </MessageBubble>

              <div className={styles.processLane}>
                {previewReasoning.map((item) => (
                  <ReasoningRow key={item.id} item={item} />
                ))}
              </div>

              <div className={styles.processLane}>
                {previewTools.map((item) => (
                  <ToolRow key={item.id} item={item} />
                ))}
              </div>

              <MessageBubble role="assistant">
                <div className={styles.finalBlock}>
                  <p className={styles.finalLead}>这一轮已经能继续推进。</p>
                  <ul className={styles.finalList}>
                    {finalAssistantNotes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              </MessageBubble>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function MessageBubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  return (
    <article
      className={`${styles.message} ${role === "user" ? styles.userMessage : styles.assistantMessage}`}
    >
      <p className={styles.messageRole}>{role === "user" ? "你的输入" : "系统输出"}</p>
      <div className={styles.messageBody}>{children}</div>
    </article>
  );
}

function ReasoningRow({ item }: { item: PreviewReasoning }) {
  const [expanded, setExpanded] = useState(item.defaultExpanded ?? item.status !== "success");
  const meta = reasoningStatusMeta[item.status];

  return (
    <section className={`${styles.reasoningRow} ${meta.tone}`}>
      <button
        className={styles.rowButton}
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <div className={styles.rowLeading}>
          <span className={`${styles.statusPill} ${meta.tone}`}>{meta.label}</span>
          <div>
            <p className={styles.rowTitle}>{item.title}</p>
            <p className={styles.rowSummary}>{item.summary}</p>
          </div>
        </div>
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}>⌄</span>
      </button>

      <div className={`${styles.expandable} ${expanded ? styles.expandableOpen : ""}`}>
        <div className={styles.expandableInner}>
          <ul className={styles.detailList}>
            {item.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ToolRow({ item }: { item: PreviewTool }) {
  const [expanded, setExpanded] = useState(item.defaultExpanded ?? item.status !== "success");
  const meta = toolStatusMeta[item.status];

  return (
    <section className={`${styles.toolRow} ${meta.tone}`}>
      <button
        className={styles.rowButton}
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <div className={styles.rowLeading}>
          <span className={`${styles.statusPill} ${meta.tone}`}>{item.phase}</span>
          <div>
            <div className={styles.toolHeadline}>
              <p className={styles.rowTitle}>{item.name}</p>
              <span className={styles.toolHeadlineMeta}>{meta.label}</span>
            </div>
            <p className={styles.rowSummary}>{item.summary}</p>
          </div>
        </div>
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}>⌄</span>
      </button>

      <div className={`${styles.expandable} ${expanded ? styles.expandableOpen : ""}`}>
        <div className={styles.expandableInner}>
          <p className={styles.toolDetail}>{item.detail}</p>
          <dl className={styles.metricGrid}>
            {item.metrics.map((metric) => (
              <div key={`${item.id}-${metric.label}`} className={styles.metricItem}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
