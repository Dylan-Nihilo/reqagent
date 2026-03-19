"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { ReqArtifactFileList } from "@/components/ReqArtifactFileList";
import { ReqAgentWorkbench } from "@/components/ReqAgentWorkbench";
import { ReqAgentWorkbenchScene } from "@/components/ReqAgentWorkbenchScene";
import { ReqComposer } from "@/components/ReqComposer";
import { ReqEmptyState } from "@/components/ReqEmptyState";
import { ReqMessage } from "@/components/ReqMessage";
import { ReqNavDrawer } from "@/components/ReqNavDrawer";
import { ReqScrollToBottom } from "@/components/ReqScrollToBottom";
import { ReqThinkingBlock } from "@/components/ReqThinkingBlock";
import { ReqToolCard } from "@/components/ReqToolCard";
import styles from "./ReqAgentComponentGallery.module.css";

import type { AgentActivity, ToolExecutionState } from "@/lib/types";

type ComponentStage = "base" | "deferred";

const componentInventory: Array<{
  id: string;
  section: string;
  stage: ComponentStage;
  name: string;
  summary: string;
}> = [
  {
    id: "empty-state",
    section: "Base",
    stage: "base",
    name: "ReqEmptyState",
    summary: "首页欢迎屏与 landing composer 容器。",
  },
  {
    id: "message",
    section: "Base",
    stage: "base",
    name: "ReqMessage",
    summary: "统一用户消息与 assistant 消息的排版壳。",
  },
  {
    id: "thinking",
    section: "Base",
    stage: "base",
    name: "ReqThinkingBlock",
    summary: "运行态/完成态 thinking 过程块。",
  },
  {
    id: "tool",
    section: "Base",
    stage: "base",
    name: "ReqToolCard",
    summary: "四个 tool UI 的共享卡片。",
  },
  {
    id: "composer",
    section: "Base",
    stage: "base",
    name: "ReqComposer",
    summary: "landing 和 thread 两种输入框。",
  },
  {
    id: "artifact-list",
    section: "Base",
    stage: "base",
    name: "ReqArtifactFileList",
    summary: "右侧产物文件列表。",
  },
  {
    id: "drawer",
    section: "Base",
    stage: "base",
    name: "ReqNavDrawer",
    summary: "左上角会话抽屉。",
  },
  {
    id: "scroll-bottom",
    section: "Base",
    stage: "base",
    name: "ReqScrollToBottom",
    summary: "线程回到底部胶囊按钮。",
  },
  {
    id: "suggestions",
    section: "Deferred",
    stage: "deferred",
    name: "Suggestion Chips",
    summary: "后续再决定是否进入正式组件库。",
  },
  {
    id: "story-board",
    section: "Deferred",
    stage: "deferred",
    name: "Story Board",
    summary: "当前先保留为产物数据，不拉进首页主链路。",
  },
  {
    id: "doc-preview",
    section: "Deferred",
    stage: "deferred",
    name: "Doc Preview",
    summary: "文件预览后续再接，不在这版首页启用。",
  },
  {
    id: "approval",
    section: "Deferred",
    stage: "deferred",
    name: "Approval Gate",
    summary: "危险操作确认后续再接。",
  },
];

const sectionOrder = ["Base", "Deferred"] as const;

export function ReqAgentComponentGallery() {
  const [thinkingOpen, setThinkingOpen] = useState(true);

  const grouped = useMemo(() => {
    return sectionOrder.map((section) => ({
      section,
      items: componentInventory.filter((item) => item.section === section),
    }));
  }, []);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>ReqAgent UI Gallery</p>
            <h1 className={styles.title}>gallery 是组件母版，不再只是参考图。</h1>
            <p className={styles.lead}>
              首页现在应该来消费这里定义的共享组件。验收标准也很简单：消息、thinking、tool、composer、artifact、nav
              必须在这里和首页使用同一份实现。
            </p>
          </div>

          <div className={styles.heroMeta}>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Base Rule</span>
              <span className={styles.metaValue}>gallery first</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Homepage</span>
              <span className={styles.metaValue}>consume shared components</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>Scope</span>
              <span className={styles.metaValue}>真实组件，不演假产品</span>
            </div>
          </div>
        </header>

        <section className={styles.indexPanel}>
          <div>
            <p className={styles.indexTitle}>当前组件清单</p>
            <p className={styles.indexText}>`Base` 是首页现在就该消费的组件；`Deferred` 只保留 inventory，不假装已经产品化。</p>
          </div>
          <div className={styles.indexList}>
            {grouped.map(({ section, items }) => (
              <div key={section} className={styles.indexGroup}>
                <p className={styles.indexGroupName}>{section}</p>
                <ul className={styles.inventoryList}>
                  {items.map((item) => (
                    <li key={item.id} className={styles.inventoryItem}>
                      <span>{item.name}</span>
                      <StagePill stage={item.stage} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <GallerySection
          tag="01"
          title="Workbench Composition"
          description="这不是首页复刻，而是展示首页真正会用到的那批共享组件如何组合。"
        >
          <ReqAgentWorkbench
            artifactCount={2}
            artifactPanel={
              <ReqArtifactFileList
                count={2}
                items={[
                  {
                    id: "stories",
                    name: "user-stories.md",
                    description: "登录注册模块",
                    meta: "7 stories · ReqDecomposer",
                  },
                  {
                    id: "doc",
                    name: "需求文档.md",
                    description: "登录注册模块",
                    meta: "2143 chars · DocGenerator",
                  },
                ]}
                title="文件"
              />
            }
            currentAgent="ReqDecomposer"
            mode="preview"
            navHint="未来真实多会话列表接进来之前，这里只保留当前会话信息。"
            threadTitle="用户登录注册"
          >
            <ReqAgentWorkbenchScene
              composer={
                <ReqComposer
                  hint="shift + enter 换行"
                  placeholder="描述产品目标、用户角色、核心功能和约束条件……"
                  preview
                  variant="thread"
                />
              }
              header={
                <div className={styles.panelTopline}>
                  <span className={styles.panelEyebrow}>Conversation</span>
                  <span className={styles.panelMeta}>同一份消息 / thinking / tool / composer</span>
                </div>
              }
              messages={
                <div className={styles.previewStack}>
                  <ReqMessage role="user">我要做一个用户登录注册模块，支持邮箱和手机号两种方式。</ReqMessage>
                  <ReqMessage role="assistant">
                    可以开始拆解，不过还需要两个关键约束：手机号登录使用验证码还是密码？是否要求邮箱验证闭环？
                  </ReqMessage>
                  <ReqToolCard
                    description="按 Must / Should / Could 生成用户故事与验收标准。"
                    metrics={[
                      { label: "total", value: "7" },
                      { label: "must", value: "3" },
                      { label: "should", value: "2" },
                      { label: "could", value: "2" },
                    ]}
                    name="generate_stories"
                    status="running"
                    summary="正在展开优先级明确的用户故事，完成后会加入右侧产物列表。"
                  />
                </div>
              }
              mode="preview"
              scrollToBottom={
                <div>
                  <ReqScrollToBottom>回到底部</ReqScrollToBottom>
                </div>
              }
              thinking={
                <ReqThinkingBlock
                  agent="ReqDecomposer"
                  elapsedLabel="2.4s"
                  mode="running"
                  onToggle={() => setThinkingOpen((value) => !value)}
                  open={thinkingOpen}
                  phaseLabel="生成故事"
                  summary="当前判断是：信息已经足够进入拆解，但登录方式和验证闭环会直接影响 story 数量与风险边界。"
                />
              }
            />
          </ReqAgentWorkbench>
        </GallerySection>

        <div className={styles.sectionGrid}>
          <GallerySection
            tag="02"
            title="ReqEmptyState"
            description="首页初始欢迎屏。这里只展示共享组件本体，不再内嵌一套单独 landing 样式。"
          >
            <ReqEmptyState
              description="输入一段产品目标、用户角色或功能想法。对话开始后，Agent、工具过程和产出物会按实际进展逐步出现。"
              title="需要拆解什么需求？"
            >
              <ReqComposer
                hint="shift + enter 换行"
                placeholder="描述产品目标、用户角色、核心功能和约束条件……"
                preview
                variant="landing"
              />
            </ReqEmptyState>
          </GallerySection>

          <GallerySection
            tag="03"
            title="ReqMessage"
            description="用户消息和 assistant 消息共用一套壳。首页里的 runtime wrapper 只负责把内容塞进去。"
          >
            <div className={styles.previewStack}>
              <ReqMessage role="user">我想做一个 B2B 商城的登录与权限系统。</ReqMessage>
              <ReqMessage role="assistant">
                可以继续，但需要先补充两个边界：是否区分管理员与采购角色？权限是基于角色还是基于组织节点？
              </ReqMessage>
            </div>
          </GallerySection>
        </div>

        <div className={styles.sectionGrid}>
          <GallerySection
            tag="04"
            title="ReqThinkingBlock"
            description="只展示过程摘要，不暴露模型私有推理内容。运行态展开，完成态可以折成一行 chip。"
          >
            <div className={styles.previewStack}>
              <ReqThinkingBlock
                agent="Orchestrator"
                elapsedLabel="1.2s"
                mode="running"
                onToggle={() => setThinkingOpen((value) => !value)}
                open={thinkingOpen}
                phaseLabel="待判断"
                summary="Orchestrator 正在判断信息是否足够，如果关键业务边界还不清楚，它会先追问。"
              />
              <ReqThinkingBlock
                agent="DocGenerator"
                elapsedLabel="8.1s"
                mode="completed"
                onToggle={() => setThinkingOpen((value) => !value)}
                open={false}
                phaseLabel="生成文档"
                summary="DocGenerator 已完成 Markdown 草稿输出。"
              />
            </div>
          </GallerySection>

          <GallerySection
            tag="05"
            title="ReqToolCard"
            description="四个工具都应当共享这一套 monochrome card，而不是首页一套、gallery 一套。"
          >
            <div className={styles.previewStack}>
              <ReqToolCard
                description="把原始需求转换成结构化 brief。"
                metrics={[
                  { label: "project", value: "登录注册模块" },
                  { label: "users", value: "3" },
                  { label: "ambiguities", value: "2" },
                ]}
                name="parse_input"
                status="complete"
                summary="已识别登录注册模块的核心角色、能力和歧义点。"
              />
              <ReqToolCard
                description="输出最终 Markdown 需求文档草稿，并同步为文件型产物。"
                metrics={[
                  { label: "project", value: "登录注册模块" },
                  { label: "format", value: "markdown" },
                  { label: "chars", value: "2143" },
                ]}
                name="generate_doc"
                status="incomplete"
                summary="需求文档生成已中断。"
              />
            </div>
          </GallerySection>
        </div>

        <div className={styles.sectionGrid}>
          <GallerySection
            tag="06"
            title="ReqComposer"
            description="landing 和 thread 只允许布局差异，不再出现两套视觉语言。"
          >
            <div className={styles.previewStack}>
              <ReqComposer
                hint="shift + enter 换行"
                placeholder="描述产品目标、用户角色、核心功能和约束条件……"
                preview
                variant="landing"
              />
              <ReqComposer hint="shift + enter 换行" placeholder="继续补充细节..." preview variant="thread" />
            </div>
          </GallerySection>

          <GallerySection
            tag="07"
            title="ReqArtifactFileList"
            description="右侧只展示真实文件型产物，不再把 brief / notes / preview 混进一个假工作台。"
          >
            <ReqArtifactFileList
              count={2}
              items={[
                {
                  id: "stories",
                  name: "user-stories.md",
                  description: "登录注册模块",
                  meta: "7 stories · ReqDecomposer",
                },
                {
                  id: "doc",
                  name: "需求文档.md",
                  description: "登录注册模块",
                  meta: "2143 chars · DocGenerator",
                },
              ]}
              title="文件"
            />
          </GallerySection>
        </div>

        <div className={styles.sectionGrid}>
          <GallerySection
            tag="08"
            title="ReqNavDrawer"
            description="左上角抽屉只展示当前会话信息，不伪造多线程列表。"
          >
            <ReqNavDrawer
              currentAgent="InputParser"
              hint="真实多会话管理后续再接入，这一版先把主线程体验做对。"
              threadTitle="支付结算流程"
            />
          </GallerySection>

          <GallerySection
            tag="09"
            title="ReqScrollToBottom"
            description="只是样式壳，真实行为仍由 assistant-ui 的 `ThreadPrimitive.ScrollToBottom` 提供。"
          >
            <div>
              <ReqScrollToBottom>回到底部</ReqScrollToBottom>
            </div>
          </GallerySection>
        </div>

        <GallerySection
          tag="10"
          title="Agent Activity States"
          description="AgentActivity 的所有变体——用 ReqThinkingBlock 静态预览每种状态在 UI 中的表现。"
        >
          <div className={styles.previewStack}>
            <AgentActivityPreview activity="idle" />
            <AgentActivityPreview activity="thinking" />
            <AgentActivityPreview activity="responding" />
            <AgentActivityPreview activity="tool_calling" />
            <AgentActivityPreview activity="reading" />
            <AgentActivityPreview activity="searching" />
            <AgentActivityPreview activity="handoff" />
            <AgentActivityPreview activity="error" />
          </div>
        </GallerySection>

        <GallerySection
          tag="11"
          title="Tool Execution Lifecycle"
          description="ToolExecutionState 的每种状态对应到 ReqToolCard 的视觉表现。"
        >
          <div className={styles.previewStack}>
            <ToolExecutionPreview state="pending" />
            <ToolExecutionPreview state="running" />
            <ToolExecutionPreview state="streaming" />
            <ToolExecutionPreview state="success" />
            <ToolExecutionPreview state="error" />
          </div>
        </GallerySection>

        <GallerySection
          tag="12"
          title="State Flow Demo"
          description="模拟完整执行流：用户消息 → thinking → tool call → 回复。这就是首页真实对话的骨架。"
        >
          <div className={styles.previewStack}>
            <ReqMessage role="user">帮我拆解一个用户登录注册模块的需求。</ReqMessage>
            <ReqThinkingBlock
              agent="Orchestrator"
              elapsedLabel="1.8s"
              mode="completed"
              onToggle={() => {}}
              open={false}
              phaseLabel="判断信息充分性"
              summary="信息足够，准备进入拆解阶段。"
            />
            <ReqToolCard
              description="按 Must / Should / Could 生成用户故事。"
              metrics={[
                { label: "total", value: "5" },
                { label: "must", value: "2" },
                { label: "should", value: "2" },
                { label: "could", value: "1" },
              ]}
              name="generate_stories"
              status="complete"
              summary="已生成 5 个用户故事。"
            />
            <ReqMessage role="assistant">
              已完成需求拆解，共生成 5 个用户故事，其中 2 个 Must、2 个 Should、1 个 Could。右侧产物列表已更新。
            </ReqMessage>
          </div>
        </GallerySection>

        <div className={styles.footerBar}>
          <span>ReqAgent shared component gallery</span>
          <Link className={styles.footerLink} href="/">
            back to app
          </Link>
        </div>
      </div>
    </main>
  );
}

function GallerySection({
  tag,
  title,
  description,
  children,
}: {
  tag: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionTag}>{tag}</span>
          <h2 className={styles.sectionTitle}>{title}</h2>
        </div>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function StagePill({ stage }: { stage: ComponentStage }) {
  const labels = {
    base: "base",
    deferred: "deferred",
  } as const;

  return <span className={`${styles.stagePill} ${stage === "base" ? styles.stage_v0_now : styles.stage_later}`}>{labels[stage]}</span>;
}

// ---------------------------------------------------------------------------
// Gallery preview helpers for agent state sections
// ---------------------------------------------------------------------------

const activityMeta: Record<AgentActivity, { label: string; mode: "running" | "completed" | "failed"; phase: string }> = {
  idle: { label: "空闲", mode: "completed", phase: "待命" },
  thinking: { label: "推理中", mode: "running", phase: "推理" },
  responding: { label: "回复中", mode: "running", phase: "生成" },
  tool_calling: { label: "调用工具", mode: "running", phase: "工具" },
  reading: { label: "读取中", mode: "running", phase: "读取" },
  searching: { label: "搜索中", mode: "running", phase: "搜索" },
  handoff: { label: "移交中", mode: "running", phase: "移交" },
  error: { label: "出错", mode: "failed", phase: "异常" },
};

function AgentActivityPreview({ activity }: { activity: AgentActivity }) {
  const meta = activityMeta[activity];
  return (
    <ReqThinkingBlock
      agent="Orchestrator"
      elapsedLabel={meta.mode === "running" ? "..." : "—"}
      mode={meta.mode}
      onToggle={() => {}}
      open={false}
      phaseLabel={meta.phase}
      summary={`${activity} — ${meta.label}`}
    />
  );
}

const toolStateMeta: Record<ToolExecutionState, { status: "running" | "complete" | "incomplete"; label: string }> = {
  pending: { status: "running", label: "等待执行" },
  running: { status: "running", label: "执行中" },
  streaming: { status: "running", label: "流式输出中" },
  success: { status: "complete", label: "执行成功" },
  error: { status: "incomplete", label: "执行失败" },
};

function ToolExecutionPreview({ state }: { state: ToolExecutionState }) {
  const meta = toolStateMeta[state];
  return (
    <ReqToolCard
      description={`ToolExecutionState: ${state}`}
      name="example_tool"
      status={meta.status}
      summary={meta.label}
    />
  );
}
