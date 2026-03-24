"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ReqMessage } from "@/components/ReqMessage";
import { ReqThinkingBlock } from "@/components/ReqThinkingBlock";
import { ReqToolInvocationPreview } from "@/components/tool-ui/ReqToolUI";
import {
  ReqMessageFileTile,
  ReqMessageImageTile,
  ReqMessageMarkdownPreview,
  ReqMessagePendingLine,
  ReqMessageSourceList,
} from "@/components/message-ui/ReqMessageUI";
import styles from "@/components/ReqMessageStateGallery.module.css";
import { reqMessagePartCatalog, reqMessagePartSurfaceLabels } from "@/lib/message-parts";

type StateField = {
  state: string;
  type: string;
  values: string;
  note: string;
};

const sectionDirectory = [
  {
    id: "lifecycle",
    index: "01",
    title: "生命周期矩阵",
    summary: "先看 5 态主状态机，再看它们各自的视觉差异。",
  },
  {
    id: "structure",
    index: "02",
    title: "结构属性",
    summary: "role、retry、branch 解释消息是谁发的、处于哪个分支。",
  },
  {
    id: "parts",
    index: "03",
    title: "内容部件",
    summary: "先按正文、推理、工具、引用、附件分层，再决定具体组件。",
  },
  {
    id: "interaction",
    index: "04",
    title: "交互与错误",
    summary: "hover、copy、edit、feedback 和 error language 要独立表达。",
  },
] as const;

const overviewCards = [
  {
    eyebrow: "Core Machine",
    title: "消息生命周期",
    summary: "所有消息先统一挂在 `message.status` 这条主状态机上。",
    items: ["pending", "streaming", "complete", "failed", "cancelled"],
  },
  {
    eyebrow: "Structure",
    title: "结构属性",
    summary: "同样一条消息，含义由 role、retry、branch 一起决定。",
    items: ["message.role", "message.isRetry", "message.isBranch", "message.branchIndex"],
  },
  {
    eyebrow: "Parts",
    title: "内容部件",
    summary: "消息不是一段纯文本，而是一组按类型组织的 part。",
    items: ["text", "reasoning", "tool-call", "source-*", "image", "file"],
  },
  {
    eyebrow: "Actions",
    title: "交互与错误",
    summary: "用户动作和失败语言必须能一眼区分，不混成装饰性小字。",
    items: ["hover", "copy", "edit", "feedback", "network", "rate-limit", "content-filter"],
  },
] as const;

const lifecycleFields: StateField[] = [
  {
    state: "message.status",
    type: "enum",
    values: "pending · streaming · complete · failed · cancelled",
    note: "消息页最重要的状态机。用户先靠它判断是否还在生成、是否结束、是否需要重试。",
  },
  {
    state: "message.role",
    type: "enum",
    values: "user · assistant · system",
    note: "生命周期会落在不同角色上，但视觉密度不能完全一样。",
  },
  {
    state: "text.isStreaming",
    type: "boolean",
    values: "true / false",
    note: "只控制文本游标和末尾动势，不应该替代 message.status。",
  },
  {
    state: "message.fadeIn",
    type: "boolean",
    values: "true / false",
    note: "新消息进入时可轻微上浮，但动画必须短，不抢正文。",
  },
];

const structureFields: StateField[] = [
  {
    state: "message.role",
    type: "enum",
    values: "user · assistant · system",
    note: "role 决定布局位置、头部密度、状态语气，以及是否使用系统 notice。",
  },
  {
    state: "message.isRetry",
    type: "boolean",
    values: "true / false",
    note: "重新生成的回复需要明确标记，不让用户误以为是原始答案。",
  },
  {
    state: "message.isBranch",
    type: "boolean",
    values: "true / false",
    note: "分支消息必须告诉用户自己不在主线里，避免上下文误读。",
  },
  {
    state: "message.branchIndex",
    type: "number",
    values: "N / total",
    note: "不是单独的小彩蛋，而是分支导航的最小信息单位。",
  },
];

const partFields: StateField[] = [
  {
    state: "part.kind",
    type: "enum",
    values: "text · reasoning · tool · source · image · file",
    note: "先做语义归一化，再决定 UI。`tool-result` 不是独立 part，而是 `tool-call` 的完成态。",
  },
  {
    state: "part.surface",
    type: "enum",
    values: "primary · process · execution · reference · attachment",
    note: "先定它属于哪一层，再决定是否展开、是否压缩、是否交给专属 UI 处理。",
  },
  {
    state: "part.countsAsOutput",
    type: "boolean",
    values: "true / false",
    note: "只有正文、引用、附件和已返回结果的 tool part 会把消息从 pending 推到 streaming。reasoning 不会。",
  },
  {
    state: "reasoning.isOpen",
    type: "boolean",
    values: "true / false",
    note: "thinking 默认可折叠，完成后压缩，避免长期占据主阅读层。",
  },
];

const interactionFields: StateField[] = [
  {
    state: "message.isHovered",
    type: "boolean",
    values: "true / false",
    note: "hover 负责唤起动作条，不应改变消息主体结构。",
  },
  {
    state: "message.isCopied",
    type: "boolean",
    values: "true / false",
    note: "copy 需要一个短暂、明确的正反馈，最好 1 秒内自动回退。",
  },
  {
    state: "message.isEditing",
    type: "boolean",
    values: "true / false",
    note: "用户编辑时原文应被输入态替换，而不是和 textarea 同时显示。",
  },
  {
    state: "feedback.state",
    type: "enum",
    values: "none · thumbs-up · thumbs-down",
    note: "反馈是状态，不是装饰性图标。选中后要有落定感。",
  },
  {
    state: "error.type",
    type: "enum",
    values: "network · rate-limit · context-overflow · content-filter · server-error · timeout",
    note: "错误文案必须对应具体原因，不能把所有失败都写成“出错了”。",
  },
  {
    state: "error.isRetryable",
    type: "boolean",
    values: "true / false",
    note: "是否能重试要直接影响动作区，不要让用户自己猜。",
  },
];

const lifecycleCards = [
  {
    eyebrow: "Pending",
    title: "进入工作态",
    note: "消息已被接管。这里只保留轻状态，用变化词和尾部小动画传达还在继续。",
    stage: (
      <ReqMessage meta="gpt-4o-mini" role="assistant" status="pending" title="ReqAgent">
        <ReqMessagePendingLine label="整理中" />
      </ReqMessage>
    ),
  },
  {
    eyebrow: "Streaming",
    title: "回答进行中",
    note: "正文要先可读，再用游标提示仍在继续，不要把“加载感”放大成主视觉。",
    stage: (
      <ReqMessage meta="gpt-4o-mini" role="assistant" signals={["0.8s"]} status="streaming" title="ReqAgent">
        <ReqMessageMarkdownPreview
          markdown={`先把问题拆成三层：\n\n1. 登录方式\n2. 注册闭环\n3. 权限与组织关系`}
          streaming
        />
      </ReqMessage>
    ),
  },
  {
    eyebrow: "Complete",
    title: "完成态可进入下一轮",
    note: "完成态不再强调过程，而是突出可复制、可分支、可继续追问。",
    stage: (
      <ReqMessage
        actions={[{ label: "复制" }, { label: "重新生成" }, { label: "赞同", tone: "positive" }]}
        branchLabel="2 / 3"
        isRetry
        meta="gpt-4o-mini"
        role="assistant"
        signals={["2.1s", "已整理 4 层"]}
        status="complete"
        title="ReqAgent"
      >
        <ReqMessageMarkdownPreview
          markdown={`我先给你一个稳定的拆解框架：\n\n- 账户凭证层\n- 注册校验层\n- 组织加入层\n- 权限授予层`}
        />
      </ReqMessage>
    ),
  },
  {
    eyebrow: "Failed",
    title: "失败但保留已生成内容",
    note: "失败不等于清空。保留上下文和已生成片段，动作区给出明确的重试入口。",
    stage: (
      <ReqMessage
        actions={[{ label: "重试", tone: "positive" }, { label: "复制" }]}
        meta="回答被中断"
        role="assistant"
        signals={["已生成部分内容"]}
        status="failed"
        title="ReqAgent"
      >
        <ReqMessageMarkdownPreview markdown="我已经整理出注册校验和邀请码闭环，组织角色映射在请求超时前中断了。" />
      </ReqMessage>
    ),
  },
  {
    eyebrow: "Cancelled",
    title: "取消是独立状态",
    note: "手动停止不是错误。视觉上要和 failed 分开，让用户知道系统没有崩。",
    stage: (
      <ReqMessage
        actions={[{ label: "继续追问" }, { label: "复制" }]}
        meta="已手动停止"
        role="assistant"
        signals={["可从这里继续"]}
        status="cancelled"
        title="ReqAgent"
      >
        <ReqMessageMarkdownPreview markdown="账户凭证和组织加入规则已经整理完成，剩余权限边界可以从这里继续。" />
      </ReqMessage>
    ),
  },
] as const;

const errorCatalog = [
  {
    type: "network",
    retryable: "可重试",
    guidance: "连接在请求阶段中断，保留当前上下文后直接重试。",
  },
  {
    type: "rate-limit",
    retryable: "等待恢复",
    guidance: "给出剩余额度或倒计时，不要只写“稍后再试”。",
  },
  {
    type: "context-overflow",
    retryable: "需缩减上下文",
    guidance: "提示压缩历史、切分任务，不能仅让用户盲目再发一次。",
  },
  {
    type: "content-filter",
    retryable: "通常不可重试",
    guidance: "说明触发原因的方向，并引导改写而不是死循环点击。",
  },
  {
    type: "server-error",
    retryable: "视后端状态而定",
    guidance: "说明是服务端异常，避免让用户以为是自己输入错了。",
  },
  {
    type: "timeout",
    retryable: "可重试",
    guidance: "保留 partial 内容，并让动作区优先出现“重试”。",
  },
] as const;

const previewImage = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
  `<svg width="720" height="420" viewBox="0 0 720 420" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="720" height="420" rx="28" fill="#F5F3EF"/>
    <rect x="42" y="48" width="216" height="132" rx="20" fill="#E7E2D9"/>
    <rect x="282" y="48" width="396" height="132" rx="20" fill="#ECE8E1"/>
    <rect x="42" y="206" width="636" height="166" rx="24" fill="#F2EFE9"/>
    <circle cx="114" cy="114" r="34" fill="#D8D0C2"/>
    <path d="M84 154L124 118L160 144L198 100L244 154" stroke="#534C43" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M326 110H560" stroke="#4C4540" stroke-width="16" stroke-linecap="round"/>
    <path d="M326 148H622" stroke="#B7ADA0" stroke-width="14" stroke-linecap="round"/>
    <path d="M86 256H638" stroke="#433D38" stroke-width="16" stroke-linecap="round"/>
    <path d="M86 296H584" stroke="#A89D91" stroke-width="14" stroke-linecap="round"/>
    <path d="M86 332H512" stroke="#A89D91" stroke-width="14" stroke-linecap="round"/>
  </svg>`,
)}`;

export function ReqMessageStateGallery() {
  const [reasoningOpen, setReasoningOpen] = useState(true);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroMain}>
            <p className={styles.eyebrow}>ReqAgent / Message Level</p>
            <h1 className={styles.title}>消息状态全景图</h1>
            <p className={styles.lead}>
              这页只解决一件事：把 message-level 状态讲清楚。先看统一的生命周期，再看 role、branch、part
              和错误语言。工具调用细节单独留在工具系统页，不和消息层混在一起。
            </p>
            <div className={styles.linkRow}>
              <Link className={styles.link} href="/gallery">
                返回组件库
              </Link>
              <Link className={styles.link} href="/gallery/tools">
                查看工具系统
              </Link>
              <Link className={styles.link} href="/">
                返回应用
              </Link>
            </div>
          </div>

          <aside className={styles.heroAside}>
            <div className={styles.asideBlock}>
              <p className={styles.asideLabel}>如何读这页</p>
              <ol className={styles.checklist}>
                <li>先确定消息落在哪个 `message.status`。</li>
                <li>再看 `role / retry / branch`，判断它在对话结构中的位置。</li>
                <li>最后按 `part.kind / part.surface` 和错误语言理解内容层与动作层。</li>
              </ol>
            </div>

            <div className={styles.asideBlock}>
              <p className={styles.asideLabel}>Tag Legend</p>
              <div className={styles.legend}>
                <LegendChip tag="enum" text="离散状态，必须逐项定义视觉结果" />
                <LegendChip tag="boolean" text="开关态，通常决定显示或隐藏" />
                <LegendChip tag="number" text="序号或进度，不应脱离上下文单独出现" />
                <LegendChip tag="string" text="元信息或动态文本，需要明确承载位置" />
              </div>
            </div>
          </aside>
        </header>

        <section className={styles.overviewGrid}>
          {overviewCards.map((card) => (
            <article key={card.title} className={styles.overviewCard}>
              <p className={styles.cardEyebrow}>{card.eyebrow}</p>
              <h2 className={styles.cardTitle}>{card.title}</h2>
              <p className={styles.cardSummary}>{card.summary}</p>
              <div className={styles.cardTags}>
                {card.items.map((item) => (
                  <span key={item} className={styles.cardTag}>
                    {item}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>

        <nav className={styles.directory}>
          {sectionDirectory.map((section) => (
            <a key={section.id} className={styles.directoryItem} href={`#${section.id}`}>
              <span className={styles.directoryIndex}>{section.index}</span>
              <div className={styles.directoryBody}>
                <span className={styles.directoryTitle}>{section.title}</span>
                <span className={styles.directorySummary}>{section.summary}</span>
              </div>
            </a>
          ))}
        </nav>

        <StateSection
          description="先把 5 个生命周期放到同一张板上看。这样用户在消息刚出现的 2 秒内，就能判断系统是在工作、已完成，还是出错了。"
          id="lifecycle"
          index="01"
          lead="生命周期矩阵"
          registerFooter="message.status 是消息层的总开关。其他 streaming cursor、fade-in 都只是附着其上的次级信号。"
          rows={lifecycleFields}
          title="主状态机"
        >
          {lifecycleCards.map((card) => (
            <PreviewCard key={card.title} eyebrow={card.eyebrow} note={card.note} title={card.title}>
              {card.stage}
            </PreviewCard>
          ))}
        </StateSection>

        <StateSection
          description="结构属性回答的是“这是谁发的、是不是重试、是不是在分支里”。这些不是正文内容，但会直接影响用户对上下文的理解。"
          id="structure"
          index="02"
          lead="结构属性"
          registerFooter="系统消息仍属于 message level，但它不和 user / assistant 共用同一套正文密度。"
          rows={structureFields}
          title="role / retry / branch"
        >
          <PreviewCard eyebrow="User" note="用户消息重点是输入本身，不需要额外承载过程噪音。" title="用户输入是最轻的一层">
            <ReqMessage
              actions={[{ label: "编辑" }, { label: "复制" }]}
              meta="刚刚"
              role="user"
              signals={["原始提问", "完整发送"]}
              status="complete"
              title="Dylan"
            >
              <ReqMessageMarkdownPreview markdown="我需要一个面向 B2B 管理后台的登录注册模块，支持邮箱、手机号和组织邀请码。" />
            </ReqMessage>
          </PreviewCard>

          <PreviewCard
            eyebrow="Assistant"
            note="重试标记和分支编号都挂在头部，让正文继续保持可读。"
            title="助手消息要交代上下文位置"
          >
            <ReqMessage
              actions={[{ label: "复制" }, { label: "切回主分支" }]}
              branchLabel="2 / 3"
              isRetry
              meta="gpt-4o-mini"
              role="assistant"
              signals={["重试回复", "branch"]}
              status="complete"
              title="ReqAgent"
            >
              <ReqMessageMarkdownPreview markdown="这是第二条候选回复。它沿用同一提问，但不在当前主分支里。" />
            </ReqMessage>
          </PreviewCard>

          <PreviewCard eyebrow="System" note="系统消息只负责通知，不冒充对话正文。" title="系统角色独立成 notice">
            <ReqMessage role="system" signals={["reconnecting", "session"]} status="pending" title="连接正在恢复">
              网络流中断后，顶部与消息层都可以给出恢复提示，但系统 notice 只做状态说明，不承接业务正文。
            </ReqMessage>
          </PreviewCard>

          <PreviewCard eyebrow="Reading Rule" note="把结构信息收进页首和页脚，正文才能继续稳定。" title="谁、在哪、是不是重试">
            <div className={styles.noteCard}>
              <div className={styles.noteMetricRow}>
                <span className={styles.noteMetricLabel}>role</span>
                <span className={styles.noteMetricValue}>决定布局和语气</span>
              </div>
              <div className={styles.noteMetricRow}>
                <span className={styles.noteMetricLabel}>retry</span>
                <span className={styles.noteMetricValue}>提示这不是第一次回复</span>
              </div>
              <div className={styles.noteMetricRow}>
                <span className={styles.noteMetricLabel}>branch</span>
                <span className={styles.noteMetricValue}>告诉用户当前不在主线</span>
              </div>
              <div className={styles.noteMetricRow}>
                <span className={styles.noteMetricLabel}>branchIndex</span>
                <span className={styles.noteMetricValue}>最小可导航信息，不能省</span>
              </div>
            </div>
          </PreviewCard>
        </StateSection>

        <StateSection
          description="消息层先做 part 归类：正文负责可读性，推理负责过程，工具负责执行，source 负责引用，image / file 负责附件。协议层只有 `tool-call`，结果仍附着在这个 part 上。"
          id="parts"
          index="03"
          lead="内容部件"
          registerFooter={
            <>
              `source` / `source-url` / `source-document` 会统一归到引用层；`tool-call` 仍是消息 part，但详细执行态请看{" "}
              <Link className={styles.inlineLink} href="/gallery/tools">
                /gallery/tools
              </Link>
              。
            </>
          }
          rows={partFields}
          title="part taxonomy"
        >
          <PreviewCard eyebrow="Taxonomy" note="先分层，再选组件。这样 message shell、activity 和 debug 才能说同一种语言。" title="part 先归一化，再谈视觉">
            <div className={styles.stack}>
              {reqMessagePartCatalog.map((part) => (
                <div key={part.kind} className={styles.noteCard}>
                  <div className={styles.noteMetricRow}>
                    <span className={styles.noteMetricLabel}>{part.rawTypes.join(" / ")}</span>
                    <span className={styles.noteMetricValue}>
                      {part.label} · {reqMessagePartSurfaceLabels[part.surface]}
                    </span>
                  </div>
                  <div className={styles.noteMetricValue}>{part.note}</div>
                </div>
              ))}
            </div>
          </PreviewCard>

          <PreviewCard eyebrow="Text" note="正文默认走 markdown，流式态只在结尾加游标。" title="text part 是主阅读层">
            <ReqMessage meta="gpt-4o-mini" role="assistant" signals={["字段清单"]} status="streaming" title="ReqAgent">
              <ReqMessageMarkdownPreview
                markdown={`我先整理可落地的字段清单：\n\n- 账户标识\n- 组织邀请码\n- 注册校验规则\n- 初始权限分配`}
                streaming
              />
            </ReqMessage>
          </PreviewCard>

          <PreviewCard eyebrow="Reasoning" note="thinking 是正式部件，但完成后应折叠压缩。" title="reasoning 可展开，不抢正文">
            <ReqThinkingBlock
              agent="ReqAgent"
              elapsedLabel="1.4s"
              mode="running"
              onToggle={() => setReasoningOpen((value) => !value)}
              open={reasoningOpen}
              phaseLabel="规划"
              summary="正在比较三种登录注册策略：邀请码优先、邮箱优先和手机号优先。"
            />
          </PreviewCard>

          <PreviewCard eyebrow="Execution" note="tool part 属于执行层。结果挂在同一个 tool-call part 上，message 只负责承认它存在。" title="tool 不伪装成正文">
            <ReqMessage role="assistant" signals={["tool", "execution"]} status="streaming" title="ReqAgent">
              <ReqToolInvocationPreview
                description="检索登录注册与邀请码闭环相关的领域模式。"
                name="search_knowledge"
                rawInput={{ query: "登录注册 邀请码 组织权限" }}
                state="executing"
                summary="正在补齐执行层上下文，随后回到正文。"
                title="Knowledge Search"
              />
            </ReqMessage>
          </PreviewCard>

          <PreviewCard eyebrow="Source" note="source 需要保留引用语义，而不是退化成裸链接。" title="引用是独立部件">
            <ReqMessage role="assistant" signals={["2 sources"]} status="complete" title="ReqAgent">
              <ReqMessageMarkdownPreview markdown="这里有两份可以直接复用的资料。" />
              <ReqMessageSourceList
                items={[
                  {
                    title: "OpenAI Agents SDK",
                    url: "https://openai.github.io/openai-agents-python/",
                  },
                  {
                    title: "assistant-ui Message Parts",
                    url: "https://www.assistant-ui.com/docs/components/messages",
                  },
                ]}
              />
            </ReqMessage>
          </PreviewCard>

          <PreviewCard eyebrow="Media + File" note="附件是消息 part，不该被塞回正文段落里。" title="image 与 file 分开呈现">
            <div className={styles.stack}>
              <ReqMessage role="assistant" signals={["image"]} status="complete" title="ReqAgent">
                <ReqMessageImageTile alt="registration-wireframe" caption="注册流程草图预览" src={previewImage} />
              </ReqMessage>
              <ReqMessage role="assistant" signals={["file"]} status="complete" title="ReqAgent">
                <ReqMessageFileTile filename="account-boundary.csv" mimeType="text/csv" sizeLabel="18 KB" />
              </ReqMessage>
            </div>
          </PreviewCard>
        </StateSection>

        <StateSection
          description="消息交互必须短、准、明确。hover 决定动作区是否出现；copy、feedback、edit 都需要落定感。错误文案则要直接告诉用户问题类型和下一步动作。"
          id="interaction"
          index="04"
          lead="交互与错误"
          registerFooter="动作反馈是状态的一部分。错误语言也必须是状态的一部分。两者都不能留给用户自行脑补。"
          rows={interactionFields}
          title="actions / error language"
        >
          <PreviewCard eyebrow="Hover + Feedback" note="动作条只在需要时出现，但一出现就要清楚表达当前反馈。" title="hover 不改变消息主体">
            <ReqMessage
              actions={[
                { label: "已复制", tone: "positive" },
                { label: "赞同", tone: "positive" },
                { label: "不适用", tone: "danger" },
              ]}
              meta="hover"
              role="assistant"
              signals={["message.isHovered", "feedback.state = thumbs-up"]}
              status="complete"
              title="ReqAgent"
            >
              <ReqMessageMarkdownPreview markdown="动作条只负责后续操作，不应该重新定义正文层级。" />
            </ReqMessage>
          </PreviewCard>

          <PreviewCard eyebrow="Editing" note="进入编辑态后，原消息退场，改为输入器和提交动作。" title="edit 用输入态替换原文">
            <div className={styles.editorCard}>
              <div className={styles.editorHead}>
                <span className={styles.editorLabel}>message.isEditing = true</span>
                <span className={styles.editorMeta}>用户消息编辑中</span>
              </div>
              <label className={styles.editorField}>
                <span className={styles.editorHint}>编辑后的提问</span>
                <textarea
                  className={styles.editorTextarea}
                  defaultValue="把登录注册模块改成支持组织邀请码优先，邮箱和手机号作为补充方式。"
                  readOnly
                />
              </label>
              <div className={styles.editorActions}>
                <span className={styles.ghostButton}>取消</span>
                <span className={styles.primaryButton}>保存并重新生成</span>
              </div>
            </div>
          </PreviewCard>

          <PreviewCard eyebrow="Retryable Error" note="可重试错误给动作，不可重试错误给方向。" title="错误文案必须带下一步">
            <div className={styles.stack}>
              <ReqMessage
                actions={[{ label: "重试", tone: "positive" }, { label: "查看日志" }]}
                role="system"
                signals={["network", "retryable"]}
                status="failed"
                title="网络连接失败"
              >
                连接在请求阶段中断，当前回复没有写完。保留现有上下文后可直接重试。
              </ReqMessage>
              <ReqMessage role="system" signals={["content-filter", "non-retryable"]} status="failed" title="内容被策略拦截">
                当前请求触发了内容限制。建议改写敏感段落后再次发送，而不是重复点击重试。
              </ReqMessage>
            </div>
          </PreviewCard>

          <PreviewCard eyebrow="Error Catalog" note="错误类型明确后，动作区和文案才能一起稳定。" title="6 类失败语言清单">
            <div className={styles.catalog}>
              {errorCatalog.map((item) => (
                <article key={item.type} className={styles.catalogItem}>
                  <div className={styles.catalogHead}>
                    <code className={styles.catalogCode}>{item.type}</code>
                    <span className={styles.catalogBadge}>{item.retryable}</span>
                  </div>
                  <p className={styles.catalogText}>{item.guidance}</p>
                </article>
              ))}
            </div>
          </PreviewCard>
        </StateSection>

        <footer className={styles.footer}>
          <span>ReqAgent Messages</span>
          <span>/gallery/messages</span>
        </footer>
      </div>
    </main>
  );
}

function StateSection({
  id,
  index,
  title,
  lead,
  description,
  rows,
  registerFooter,
  children,
}: {
  id: string;
  index: string;
  title: string;
  lead: string;
  description: string;
  rows: StateField[];
  registerFooter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} id={id}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <span className={styles.sectionIndex}>{index}</span>
          <div className={styles.sectionTitleGroup}>
            <p className={styles.sectionLead}>{lead}</p>
            <h2 className={styles.sectionTitle}>{title}</h2>
          </div>
        </div>
        <p className={styles.sectionDescription}>{description}</p>
      </div>

      <div className={styles.sectionBody}>
        <aside className={styles.sectionAside}>
          <StateRegister footer={registerFooter} rows={rows} title={title} />
        </aside>
        <div className={styles.previewGrid}>{children}</div>
      </div>
    </section>
  );
}

function StateRegister({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: StateField[];
  footer?: ReactNode;
}) {
  return (
    <div className={styles.register}>
      <div className={styles.registerHead}>
        <p className={styles.registerEyebrow}>State Register</p>
        <h3 className={styles.registerTitle}>{title}</h3>
      </div>

      <div className={styles.registerRows}>
        {rows.map((row) => (
          <article key={row.state} className={styles.registerRow}>
            <div className={styles.registerKeyRow}>
              <code className={styles.registerState}>{row.state}</code>
              <span className={styles.registerType}>{row.type}</span>
            </div>
            <p className={styles.registerValues}>{row.values}</p>
            <p className={styles.registerNote}>{row.note}</p>
          </article>
        ))}
      </div>

      {footer ? <div className={styles.registerFooter}>{footer}</div> : null}
    </div>
  );
}

function PreviewCard({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.previewCard}>
      <div className={styles.previewHead}>
        <p className={styles.previewEyebrow}>{eyebrow}</p>
        <h3 className={styles.previewTitle}>{title}</h3>
        <p className={styles.previewNote}>{note}</p>
      </div>
      <div className={styles.previewStage}>{children}</div>
    </article>
  );
}

function LegendChip({ tag, text }: { tag: string; text: string }) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendTag}>{tag}</span>
      <span className={styles.legendText}>{text}</span>
    </div>
  );
}
