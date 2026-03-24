"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ReqMessage } from "@/components/ReqMessage";
import {
  ReqToolCatalogPreview,
  ReqToolGroupPreview,
  ReqToolInvocationPreview,
  ReqToolPlanPreview,
} from "@/components/tool-ui/ReqToolUI";
import { ReqToolTerminal } from "@/components/ReqToolTerminal";
import styles from "@/components/ReqToolStateGallery.module.css";
import {
  getAvailableToolsResult,
  toolRiskLabels,
  type AvailableToolGroup,
  type ToolCategory,
} from "@/lib/tool-registry";
import { toolInvocationStateCatalog, type ToolInvocationStateTone } from "@/lib/tool-invocation-states";

const toolCatalog = getAvailableToolsResult();
const toolGroupMap = new Map(toolCatalog.groups.map((group) => [group.key, group] as const));

const categorySections: Array<{
  key: ToolCategory;
  anchor: string;
  index: string;
  title: string;
  lead: string;
  description: string;
}> = [
  {
    key: "structured",
    anchor: "structured-tools",
    index: "01",
    title: "结构化工具",
    lead: "先收敛问题，再决定下一步。",
    description: "用于模式检索、规则归纳和结构化答案，不直接触碰工作区或 shell。",
  },
  {
    key: "workspace",
    anchor: "workspace-tools",
    index: "02",
    title: "工作区工具",
    lead: "在项目里定位证据，而不是盲打命令。",
    description: "先列目录，再搜索，再读取具体文件；适合进入真实代码库后的定位链路。",
  },
  {
    key: "execution",
    anchor: "execution-tools",
    index: "03",
    title: "执行工具",
    lead: "执行动作要强调日志、结果和副作用。",
    description: "这一层包含 shell 与文件写入，重点展示终端质感、输出细节和简洁结果卡片。",
  },
  {
    key: "interaction",
    anchor: "interaction-tools",
    index: "04",
    title: "交互 / 审批",
    lead: "让人看懂能做什么，也能决定是否放行。",
    description: "工具目录、审批确认和未知工具兜底都属于交互层，不应退回普通文本。",
  },
];

const categoryToneClasses: Record<ToolCategory, string> = {
  structured: styles.sectionStructured,
  workspace: styles.sectionWorkspace,
  execution: styles.sectionExecution,
  interaction: styles.sectionInteraction,
  mcp: styles.sectionWorkspace,
};

const stateToneClasses: Record<ToolInvocationStateTone, string> = {
  working: styles.stateWorking,
  success: styles.stateSuccess,
  danger: styles.stateDanger,
  approval: styles.stateApproval,
};

export function ReqToolStateGallery() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>ReqAgent</p>
            <h1 className={styles.title}>Agent 工具库</h1>
            <p className={styles.lead}>
              工具按动作职责分四类：结构化收敛、工作区定位、执行动作、交互审批。分类先定义“这是什么动作”，再决定应该用哪一种表现。
            </p>
            <div className={styles.linkRow}>
              <Link className={styles.link} href="/gallery">
                返回组件库
              </Link>
              <Link className={styles.link} href="/">
                返回应用
              </Link>
            </div>
          </div>

          <aside className={styles.heroAside}>
            <p className={styles.heroAsideLabel}>分类规则</p>
            <p className={styles.heroAsideText}>
              分类按工具职责，不按组件形态。先拿到结构化信息，再进入工作区定位，再执行动作，最后通过目录或审批完成交互闭环。
            </p>
            <div className={styles.heroStats}>
              <span className={styles.heroStat}>4 类工具</span>
              <span className={styles.heroStat}>{toolCatalog.total} 个已接入工具</span>
              <span className={styles.heroStat}>{toolInvocationStateCatalog.length} 个调用状态</span>
              <span className={styles.heroStat}>/gallery/tools</span>
            </div>
          </aside>
        </header>

        <section className={styles.statusBand}>
          <div className={styles.statusIntro}>
            <p className={styles.statusEyebrow}>Invocation States</p>
            <p className={styles.statusCopy}>四类工具共享同一套调用状态语义，只是表现形态不同。</p>
          </div>

          <div className={styles.statusRail}>
            {toolInvocationStateCatalog.map((item) => (
              <article key={item.state} className={`${styles.statusChip} ${stateToneClasses[item.tone]}`}>
                <span className={styles.statusCode}>{item.state}</span>
                <span className={styles.statusName}>{item.label}</span>
                <span className={styles.statusHint}>{item.hint}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.inlineBand}>
          <div className={styles.inlineBandHead}>
            <p className={styles.statusEyebrow}>在对话里</p>
            <p className={styles.inlineBandCopy}>工具应该挂在 assistant message 里，像执行条一样顺着对话往下走，而不是另起一层重卡片。</p>
          </div>

          <ReqMessage meta="gpt-4o-mini" role="assistant" signals={["2 tools", "执行中"]} status="streaming" title="ReqAgent">
            <ReqToolGroupPreview activeCount={1} count={2} label="工具调用">
              <ReqToolInvocationPreview
                description="在工作区里定位与工具状态相关的实现。"
                metrics={[{ label: "范围", value: "tool-ui / gallery" }]}
                name="search_workspace"
                rawInput={{ query: "tool invocation state ui" }}
                state="executing"
                summary="先定位状态模型和展示层的交叉点。"
                title="工作区检索"
              />
              <ReqToolInvocationPreview
                description="读取目标文件，确认 message 与 tool 的排版骨架。"
                metrics={[{ label: "命中", value: "2 files" }]}
                name="readfile"
                rawInput={{ path: "components/tool-ui/ReqToolUI.tsx" }}
                rawOutput={{ path: "components/tool-ui/ReqToolUI.tsx", summary: "已定位到进度条与状态 token 逻辑。" }}
                state="succeeded"
                summary="读取完成，开始收口成更轻的工具执行条。"
                title="读取文件"
              />
            </ReqToolGroupPreview>
          </ReqMessage>
        </section>

        <nav className={styles.directory}>
          {categorySections.map((section) => {
            const group = getToolGroup(section.key);
            return (
              <a
                key={section.key}
                className={`${styles.directoryItem} ${categoryToneClasses[section.key]}`}
                href={`#${section.anchor}`}
              >
                <span className={styles.directoryIndex}>{section.index}</span>
                <div className={styles.directoryBody}>
                  <span className={styles.directoryTitle}>{section.title}</span>
                  <span className={styles.directoryMeta}>{section.lead}</span>
                </div>
                <span className={styles.directoryCount}>{group.tools.length} 个工具</span>
              </a>
            );
          })}
        </nav>

        <CategorySection
          anchor="structured-tools"
          description="结构化工具负责先把问题压缩成有语义的结果；输入阶段和结果卡片都应该清晰可读。"
          group={getToolGroup("structured")}
          index="01"
          lead="先收敛问题，再决定下一步。"
          title="结构化工具"
          toneClass={categoryToneClasses.structured}
        >
          <ShowcaseBlock
            eyebrow="Input Lifecycle"
            title="输入先成形，再发出"
          >
            <div className={styles.stack}>
              <ReqToolInvocationPreview
                description="搜索领域模式和最佳实践。"
                metrics={[{ label: "查询", value: "登录注册流程" }]}
                name="search_knowledge"
                rawInput={{ query: "登录注册流" }}
                state="drafting_input"
                summary="参数仍在流式补全。"
                title="知识检索"
              />
              <ReqToolInvocationPreview
                description="搜索领域模式和最佳实践。"
                metrics={[{ label: "查询", value: "登录注册流程" }]}
                name="search_knowledge"
                rawInput={{ query: "登录注册流程" }}
                state="input_ready"
                summary="查询条件已经完整，等待发出。"
                title="知识检索"
              />
              <ReqToolInvocationPreview
                description="搜索领域模式和最佳实践。"
                metrics={[
                  { label: "字段", value: "query" },
                  { label: "错误", value: "required" },
                ]}
                name="search_knowledge"
                rawInput={{ query: "" }}
                rawOutput={{ error: "Invalid input: query is required" }}
                state="input_invalid"
                summary="参数未通过 schema 校验。"
                title="知识检索"
              />
            </div>
          </ShowcaseBlock>

          <ShowcaseBlock
            eyebrow="Structured Receipt"
            title="结果卡片保持结构化"
          >
            <ReqToolInvocationPreview
              description="搜索领域模式和最佳实践。"
              metrics={[
                { label: "来源", value: "auth-patterns" },
                { label: "相关度", value: "0.92" },
              ]}
              name="search_knowledge"
              rawInput={{ query: "登录注册流程" }}
              rawOutput={{
                source: "auth-patterns",
                relevance: 0.92,
                summary: "找到适合 B2B 后台的登录注册约束模式",
              }}
              state="succeeded"
              summary="结构化答案已经稳定，可以直接成为后续动作输入。"
              title="知识检索"
            />
          </ShowcaseBlock>
        </CategorySection>

        <CategorySection
          anchor="workspace-tools"
          description="工作区工具应该像一条定位链：先知道项目边界，再搜索命中点，最后读取具体文件。"
          group={getToolGroup("workspace")}
          index="02"
          lead="在项目里定位证据，而不是盲打命令。"
          title="工作区工具"
          toneClass={categoryToneClasses.workspace}
        >
          <ShowcaseBlock
            eyebrow="Workspace Chain"
            title="目录、搜索、读取组成一条链"
          >
            <ReqToolGroupPreview activeCount={2} count={3} label="工作区定位链">
              <ReqToolInvocationPreview
                description="查看工作区目录结构。"
                metrics={[{ label: "根目录", value: "." }]}
                name="list_files"
                rawOutput={{ count: 24, root: "." }}
                state="succeeded"
                summary="目录边界已经清楚。"
                title="文件列表"
              />
              <ReqToolInvocationPreview
                description="在工作区里搜索代码、配置和文档文本。"
                metrics={[{ label: "查询", value: "toolRegistry" }]}
                name="search_workspace"
                rawInput={{ query: "toolRegistry" }}
                state="executing"
                summary="正在扫描工具注册入口。"
                title="工作区搜索"
              />
              <ReqToolInvocationPreview
                description="读取指定文件的完整内容。"
                metrics={[{ label: "路径", value: "lib/tool-registry.ts" }]}
                name="readFile"
                rawInput={{ path: "lib/tool-registry.ts" }}
                rawOutput={{ path: "lib/tool-registry.ts", charCount: 2148 }}
                state="streaming_output"
                summary="文件内容正在返回。"
                title="读取文件"
              />
            </ReqToolGroupPreview>
          </ShowcaseBlock>

          <ShowcaseBlock
            eyebrow="Settled Receipts"
            title="完成后收敛成简洁卡片"
          >
            <ReqToolGroupPreview compact count={2} expanded={false} label="工作区工具">
              <ReqToolInvocationPreview
                description="读取指定文件的完整内容。"
                metrics={[
                  { label: "路径", value: "app/page.tsx" },
                  { label: "字符", value: "931" },
                ]}
                name="readFile"
                rawOutput={{ path: "app/page.tsx", charCount: 931 }}
                state="succeeded"
                summary="目标文件已经就绪。"
                title="读取文件"
              />
              <ReqToolInvocationPreview
                description="在工作区里搜索代码、配置和文档文本。"
                metrics={[
                  { label: "查询", value: "toolRegistry" },
                  { label: "命中", value: "6 处" },
                ]}
                name="search_workspace"
                rawInput={{ query: "toolRegistry" }}
                rawOutput={{ total: 6, query: "toolRegistry" }}
                state="succeeded"
                summary="搜索结果已经稳定。"
                title="工作区搜索"
              />
            </ReqToolGroupPreview>
          </ShowcaseBlock>
        </CategorySection>

        <CategorySection
          anchor="execution-tools"
          description="执行层重点不是大段说明，而是命令、输出、退出码和副作用结果。"
          group={getToolGroup("execution")}
          index="03"
          lead="执行动作要强调日志、结果和副作用。"
          title="执行工具"
          toneClass={categoryToneClasses.execution}
        >
          <ShowcaseBlock
            eyebrow="Terminal"
            title="终端输出保留日志质感"
          >
            <div className={styles.stack}>
              <ReqToolInvocationPreview
                description="执行 shell 命令并返回 stdout / stderr。"
                extra={
                  <ReqToolTerminal
                    isRunning
                    stdout={"./app/page.tsx\n./components/tool-ui/ReqToolUI.tsx\n./lib/toolkit.tsx"}
                  />
                }
                metrics={[
                  { label: "命令", value: "find . -name '*tool*'" },
                  { label: "stdout", value: "3 行" },
                ]}
                name="bash"
                rawInput={{ command: "find . -name '*tool*'" }}
                state="streaming_output"
                summary="日志持续返回时，正文不该变成纯文本堆。"
                title="Shell 执行"
              />
              <ReqToolInvocationPreview
                description="执行 shell 命令并返回 stdout / stderr。"
                extra={
                  <ReqToolTerminal
                    exitCode={2}
                    isRunning={false}
                    stderr={"error: Found argument '--badflag' which wasn't expected"}
                    stdout=""
                  />
                }
                metrics={[
                  { label: "命令", value: "rg --badflag toolRegistry" },
                  { label: "退出码", value: "2" },
                ]}
                name="bash"
                rawInput={{ command: "rg --badflag toolRegistry" }}
                rawOutput={{ error: "ripgrep exited with code 2" }}
                state="failed"
                summary="失败结果需要带着 stderr 和 exit code 落下来。"
                title="Shell 执行"
              />
            </div>
          </ShowcaseBlock>

          <ShowcaseBlock
            eyebrow="Side Effects"
            title="副作用动作收敛成明确结果"
          >
            <ReqToolInvocationPreview
              description="创建或更新工作区文件内容。"
              extra={
                <ReqToolPlanPreview
                  steps={[
                    { label: "生成文档骨架", detail: "Markdown" },
                    { label: "写入 docs/tool-ui.md", detail: "工作区变更" },
                     { label: "返回结果", detail: "path / charCount" },
                  ]}
                />
              }
              metrics={[
                { label: "路径", value: "docs/tool-ui.md" },
                { label: "字符", value: "1,248" },
              ]}
              name="writeFile"
              rawInput={{ path: "docs/tool-ui.md", content: "# Tool UI" }}
              rawOutput={{ path: "docs/tool-ui.md", charCount: 1248 }}
              state="succeeded"
               summary="写入完成后要收敛成结果卡片，而不是继续像运行卡片。"
              title="写入文件"
            />
          </ShowcaseBlock>
        </CategorySection>

        <CategorySection
          anchor="interaction-tools"
          description="交互层负责解释能力边界、处理高影响确认，并给未知工具稳定兜底。"
          group={getToolGroup("interaction")}
          index="04"
          lead="让人看懂能做什么，也能决定是否放行。"
          title="交互 / 审批"
          toneClass={categoryToneClasses.interaction}
        >
          <ShowcaseBlock
            eyebrow="Catalog"
            title="工具能力应该像对话里的高亮片段"
          >
            <ReqToolCatalogPreview result={toolCatalog} />
          </ShowcaseBlock>

          <ShowcaseBlock
            eyebrow="Approval And Fallback"
            title="审批和兜底都属于交互层"
          >
            <div className={styles.stack}>
              <ReqToolInvocationPreview
                description="创建或更新工作区文件内容。"
                extra={
                  <ReqToolPlanPreview
                    steps={[
                      { label: "对比现有文档", detail: "docs/tool-ui.md" },
                      { label: "写入新内容", detail: "工作区变更" },
                       { label: "返回写入结果", detail: "path / charCount" },
                    ]}
                  />
                }
                metrics={[
                  { label: "路径", value: "docs/tool-ui.md" },
                  { label: "影响", value: "工作区变更" },
                ]}
                name="writeFile"
                rawInput={{ path: "docs/tool-ui.md", content: "# Tool UI" }}
                state="awaiting_approval"
                summary="审批界面要先说明会执行什么、影响什么。"
                title="写入文件"
              />
              <ReqToolInvocationPreview
                description="执行 shell 命令并返回 stdout / stderr。"
                metrics={[
                  { label: "命令", value: "rm -rf build" },
                  { label: "结果", value: "blocked" },
                ]}
                name="bash"
                rawInput={{ command: "rm -rf build" }}
                rawOutput={{ error: "Tool approval denied" }}
                state="denied"
                summary="拒绝不是错误，它是明确的权限结果。"
                title="Shell 执行"
              />
              <ReqToolInvocationPreview
                description="未知工具或未来 MCP 工具的兜底表现。"
                metrics={[
                  { label: "工具", value: "mcp.remote_search" },
                  { label: "状态", value: "fallback" },
                ]}
                name="mcp.remote_search"
                rawInput={{ query: "assistant-ui tools" }}
                rawOutput={{ total: 4, summary: "Found 4 results" }}
                state="succeeded"
                 summary="未知工具也必须有可读结果卡片，不能回退成裸 JSON。"
                title="Unknown / Fallback"
              />
            </div>
          </ShowcaseBlock>
        </CategorySection>

        <footer className={styles.footer}>
          <span>ReqAgent Agent Tools</span>
          <span>/gallery/tools</span>
        </footer>
      </div>
    </main>
  );
}

function CategorySection({
  anchor,
  children,
  description,
  group,
  index,
  lead,
  title,
  toneClass,
}: {
  anchor: string;
  children: ReactNode;
  description: string;
  group: AvailableToolGroup;
  index: string;
  lead: string;
  title: string;
  toneClass: string;
}) {
  return (
    <section className={`${styles.section} ${toneClass}`} id={anchor}>
      <div className={styles.sectionChrome}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionIndex}>{index}</span>
            <h2 className={styles.sectionTitle}>{title}</h2>
          </div>
          <p className={styles.sectionLead}>{lead}</p>
          <p className={styles.sectionDescription}>{description}</p>
        </div>

        <ToolRoster group={group} />
      </div>

      <div className={styles.previewGrid}>{children}</div>
    </section>
  );
}

function ShowcaseBlock({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className={styles.showcase}>
      <div className={styles.showcaseHead}>
        <p className={styles.showcaseEyebrow}>{eyebrow}</p>
        <h3 className={styles.showcaseTitle}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function ToolRoster({ group }: { group: AvailableToolGroup }) {
  return (
    <aside className={styles.roster}>
      <div className={styles.rosterHead}>
        <span className={styles.rosterLabel}>本类工具</span>
        <span className={styles.rosterCount}>{group.tools.length} 项</span>
      </div>

      <div className={styles.rosterList}>
        {group.tools.map((tool) => (
          <article key={tool.name} className={styles.rosterItem}>
            <div className={styles.rosterNameRow}>
              <span className={styles.rosterTitle}>{tool.title}</span>
              <span className={styles.rosterCode}>{tool.name}</span>
            </div>
            <p className={styles.rosterDescription}>{tool.description}</p>
            <p className={styles.rosterHint}>{tool.usageHint}</p>
            <div className={styles.rosterSignals}>
              <span className={styles.rosterSignal}>{toolRiskLabels[tool.riskLevel]}</span>
              {tool.preferredToBash ? <span className={styles.rosterSignal}>优先于 bash</span> : null}
              {tool.supportsApproval ? <span className={styles.rosterSignal}>需要审批</span> : null}
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}

function getToolGroup(key: ToolCategory): AvailableToolGroup {
  const group = toolGroupMap.get(key);

  if (!group) {
    throw new Error(`Missing tool group: ${key}`);
  }

  return group;
}
