"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PropsWithChildren,
  type ReactNode,
  type SVGProps,
} from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { useAuiState } from "@assistant-ui/store";
import { ReqToolTerminal } from "@/components/ReqToolTerminal";
import { useReqToolApproval } from "@/components/tool-ui/ReqToolApprovalContext";
import { safeParseBashToolInput, safeParseReqToolTerminalPayload } from "@/components/tool-ui/terminal/schema";
import styles from "@/components/tool-ui/ReqToolUI.module.css";
import {
  getToolRegistryItem,
  toolCategoryLabels,
  toolRiskLabels,
  type AvailableToolsResult,
  type ToolRegistryItem,
} from "@/lib/tool-registry";
import {
  getToolExecutionCaption,
  getToolInputCaption,
  getToolInvocationStateLabel,
  getToolResultCaption,
  isActiveToolInvocationState,
  isTerminalRunningToolInvocationState,
} from "@/lib/tool-invocation-states";
import {
  parseToolArgsText,
  resolveToolInvocationViewState,
  type ReqAgentMessageMeta,
  type ToolInvocationViewState,
} from "@/lib/types";

type ToolMetric = {
  label: string;
  value: string;
};

type StaticToolInvocationProps = {
  name: string;
  title?: string;
  description: string;
  summary?: string;
  state: ToolInvocationViewState;
  metrics?: ToolMetric[];
  rawInput?: unknown;
  rawOutput?: unknown;
  extra?: ReactNode;
};

type StaticToolGroupProps = PropsWithChildren<{
  label: string;
  count: number;
  activeCount?: number;
  compact?: boolean;
  expanded?: boolean;
}>;

type ToolGroupStatus = "active" | "settled";
type ProgressMarker = "idle" | "active" | "done" | "error";

export function ReqToolGroup({
  children,
  startIndex,
  endIndex,
}: PropsWithChildren<{
  startIndex: number;
  endIndex: number;
}>) {
  // Keep the store selector stable. Slicing inside useAuiState returns a new
  // array every render and can trigger an infinite subscription loop.
  const allParts = useAuiState((state) => state.message.parts);
  const meta = useCurrentMessageMeta();
  const parts = useMemo(
    () => allParts.slice(startIndex, endIndex + 1),
    [allParts, startIndex, endIndex],
  );
  const states = parts
    .filter((part): part is Extract<(typeof parts)[number], { type: "tool-call" }> => part.type === "tool-call")
    .map((part) =>
      resolveToolInvocationViewState({
        argsText: part.argsText,
        interrupt: part.interrupt,
        isError: part.isError,
        metadata: meta,
        result: part.result,
        status: part.status,
        toolCallId: part.toolCallId,
      }),
    );

  const activeCount = states.filter((state) => isActiveToolInvocationState(state)).length;
  const status: ToolGroupStatus = activeCount > 0 ? "active" : "settled";

  return (
    <ToolGroupShell
      activeCount={activeCount}
      compact={status === "settled"}
      count={endIndex - startIndex + 1}
      label={status === "active" ? "工具调用" : "已调用工具"}
      status={status}
    >
      {children}
    </ToolGroupShell>
  );
}

export function ReqToolPart(props: ToolCallMessagePartProps) {
  const meta = useCurrentMessageMeta();
  const registryItem = getToolRegistryItem(props.toolName);
  const viewState = resolveToolInvocationViewState({
    argsText: props.argsText,
    interrupt: props.interrupt,
    isError: props.isError,
    metadata: meta,
    result: props.result,
    status: props.status,
    toolCallId: props.toolCallId,
  });

  if (isAvailableToolsResult(props.result)) {
    return (
      <ReqToolCatalogCall
        name={props.toolName}
        result={props.result}
        rawInput={props.args}
        state={viewState}
        title={registryItem?.title}
      />
    );
  }

  if (props.toolName === "bash") {
    return <ReqBashToolPart registryItem={registryItem} state={viewState} {...props} />;
  }

  const metrics = extractStructuredMetrics(props.result);
  const approval = props.interrupt?.type === "human" ? props.interrupt.payload : null;
  const plan = extractPlan(props.result);
  const summary = buildToolSummary({
    registryItem,
    result: props.result,
    state: viewState,
  });
  const debugInfo = {
    argsText: props.argsText,
    interrupt: props.interrupt ?? null,
    isError: props.isError,
    metadataState: meta?.toolInvocationStates?.[props.toolCallId] ?? null,
    status: props.status,
    toolCallId: props.toolCallId,
    toolName: props.toolName,
    viewState,
  };

  return (
    <ToolShell
      description={registryItem?.description ?? "后端工具执行回执。"}
      debugInfo={debugInfo}
      extra={
        <>
          <ReqToolProgressTracker state={viewState} supportsApproval={registryItem?.supportsApproval ?? false} />
          {approval ? (
            <ReqToolApprovalCard
              approval={approval}
              description={summarizeStructuredArgs(props.args, props.argsText)}
              registryItem={registryItem}
              resume={props.resume}
            />
          ) : null}
          {plan ? <ReqToolPlanPreview steps={plan} /> : null}
        </>
      }
      metrics={metrics}
      name={props.toolName}
      rawInput={props.args}
      rawOutput={props.result}
      state={viewState}
      summary={summary}
      title={registryItem?.title}
    />
  );
}

export function ReqToolInvocationPreview({
  description,
  extra,
  metrics,
  name,
  rawInput,
  rawOutput,
  state,
  summary,
  title,
}: StaticToolInvocationProps) {
  return (
    <ToolShell
      description={description}
      extra={extra}
      metrics={metrics}
      name={name}
      rawInput={rawInput}
      rawOutput={rawOutput}
      state={state}
      summary={summary}
      title={title}
    />
  );
}

export function ReqToolGroupPreview({
  activeCount = 0,
  children,
  compact = false,
  count,
  label,
}: StaticToolGroupProps) {
  return (
    <ToolGroupShell
      activeCount={activeCount}
      compact={compact}
      count={count}
      label={label}
      status={activeCount > 0 ? "active" : "settled"}
    >
      {children}
    </ToolGroupShell>
  );
}

export function ReqToolCatalogPreview({ result }: { result: AvailableToolsResult }) {
  return (
    <div className={styles.catalog}>
      {result.groups.map((group) => (
        <section key={group.key} className={styles.catalogGroup}>
          <div className={styles.catalogGroupHeader}>
            <div className={styles.catalogGroupTitleWrap}>
              <span className={styles.catalogEyebrow}>{toolCategoryLabels[group.key]}</span>
              <h4 className={styles.catalogGroupTitle}>当前可直接调用的 {group.tools.length} 个工具</h4>
            </div>
            <span className={styles.groupPill}>{group.tools.length} 项</span>
          </div>

          <div className={styles.catalogFlow}>
            {group.tools.map((tool) => {
              const registryItem = getToolRegistryItem(tool.name);
              return (
                <article key={tool.name} className={styles.catalogSnippet}>
                  <div className={styles.catalogSnippetHead}>
                    <span className={styles.catalogSnippetIcon}>
                      <ToolGlyph name={tool.name} registryItem={registryItem} />
                    </span>
                    <div className={styles.catalogSnippetBody}>
                      <p className={styles.catalogSnippetLine}>
                        可用工具 <span className={styles.catalogSnippetTitle}>{tool.title}</span>
                        <span className={`${styles.catalogSnippetCode} ${styles.code}`}>{tool.name}</span>
                      </p>
                      <p className={styles.catalogSnippetText}>{tool.usageHint}</p>
                    </div>
                  </div>

                  <div className={styles.catalogSnippetSignals}>
                    <span className={styles.riskPill}>{toolRiskLabels[tool.riskLevel]}</span>
                    {tool.preferredToBash ? <span className={styles.hintPill}>优先于 bash</span> : null}
                    {tool.supportsApproval ? <span className={styles.approvalPill}>需要审批</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReqToolCatalogCall({
  name,
  title,
  state,
  result,
  rawInput,
}: {
  name: string;
  title?: string;
  state: ToolInvocationViewState;
  result: AvailableToolsResult;
  rawInput?: unknown;
}) {
  const registryItem = getToolRegistryItem(name);
  const formattedInput = formatRawBlock(rawInput);

  return (
    <article className={joinClasses(getToolItemClassName(state), styles.toolItemExpanded, styles.toolCatalogCall)}>
      <div className={styles.toolStrip}>
        <div className={styles.toolTopline}>
          <div className={styles.toolIdentity}>
            <div className={styles.toolTitleRow}>
              <span className={styles.toolIconBadge}>
                <ToolGlyph name={name} registryItem={registryItem} />
              </span>
              <p className={styles.toolTitle}>{title ?? registryItem?.title ?? name}</p>
              <span className={`${styles.toolName} ${styles.code}`}>{name}</span>
            </div>
            <p className={styles.toolSummary}>{result.summary}</p>
          </div>

          <div className={styles.toolAside}>
            <span className={getStatusTokenClassName(state)}>
              <StatusGlyph state={state} />
              {getToolInvocationStateLabel(state)}
            </span>
          </div>
        </div>

        <div className={styles.metricStrip}>
          <span className={styles.metricToken}>
            <span className={styles.metricLabel}>工具数</span>
            <span className={styles.metricValue}>{String(result.total)}</span>
          </span>
        </div>
      </div>

      <div className={styles.toolPanel}>
        <p className={styles.panelIntro}>{registryItem?.description ?? "用对话里的高亮片段说明当前能调用什么。"}</p>
        <div className={styles.body}>
          <ReqToolCatalogPreview result={result} />
        </div>

        {formattedInput ? (
          <div className={styles.rawPanel}>
            <div className={styles.rawBlock}>
              <span className={styles.rawLabel}>Input</span>
              <pre className={styles.rawPre}>{formattedInput}</pre>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function ReqToolPlanPreview({
  steps,
}: {
  steps: Array<{ label: string; detail?: string }>;
}) {
  return (
    <div className={styles.plan}>
      {steps.map((step, index) => (
        <div key={`${step.label}-${index}`} className={styles.planRow}>
          <span className={styles.planIndex}>{String(index + 1).padStart(2, "0")}</span>
          <div className={styles.planLabel}>
            {step.label}
            {step.detail ? <span className={styles.planDetail}> · {step.detail}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReqBashToolPart(props: ToolCallMessagePartProps & { state: ToolInvocationViewState; registryItem?: ToolRegistryItem }) {
  const args = safeParseBashToolInput(props.args);
  const command = args?.command?.trim() || "bash";
  const terminal =
    props.result && typeof props.result === "object"
      ? safeParseReqToolTerminalPayload({
          command,
          ...(props.result as Record<string, unknown>),
        })
      : null;

  const stdoutLineCount = countLines(terminal?.stdout);
  const stderrLineCount = countLines(terminal?.stderr);
  const metrics = [
    typeof terminal?.exitCode === "number" ? { label: "退出码", value: String(terminal.exitCode) } : null,
    stdoutLineCount > 0 ? { label: "stdout", value: `${stdoutLineCount} 行` } : null,
    stderrLineCount > 0 ? { label: "stderr", value: `${stderrLineCount} 行` } : null,
  ].filter(Boolean) as ToolMetric[];
  const debugInfo = {
    argsText: props.argsText,
    command,
    interrupt: props.interrupt ?? null,
    parsedArgs: args,
    status: props.status,
    terminal,
    toolCallId: props.toolCallId,
    toolName: props.toolName,
    viewState: props.state,
  };

  return (
    <ToolShell
      description={props.registryItem?.description ?? "执行 shell 命令并返回标准输出。"}
      debugInfo={debugInfo}
      extra={
        <>
          <ReqToolProgressTracker state={props.state} supportsApproval={props.registryItem?.supportsApproval ?? false} />
          {props.interrupt?.type === "human" ? (
            <ReqToolApprovalCard
              approval={props.interrupt.payload}
              description={truncate(command, 160)}
              registryItem={props.registryItem}
              resume={props.resume}
            />
          ) : null}
          <ReqToolTerminal
            exitCode={terminal?.exitCode}
            isRunning={isTerminalRunningToolInvocationState(props.state)}
            stderr={terminal?.stderr}
            stdout={terminal?.stdout}
            truncated={terminal?.truncated}
          />
        </>
      }
      metrics={metrics}
      name={props.toolName}
      rawInput={props.args}
      rawOutput={props.result}
      state={props.state}
      summary={buildBashSummary(props.state, command, terminal)}
      title={props.registryItem?.title}
    />
  );
}

function ReqToolApprovalCard({
  approval,
  description,
  registryItem,
  resume,
}: {
  approval: unknown;
  description: string;
  registryItem?: ToolRegistryItem;
  resume: (payload: unknown) => void;
}) {
  const approvalApi = useReqToolApproval();
  const [isPending, startTransition] = useTransition();
  const approvalId = typeof approval === "object" && approval && "id" in approval ? String((approval as { id: unknown }).id) : null;

  function respond(approved: boolean) {
    startTransition(() => {
      if (approvalApi && approvalId) {
        void approvalApi({
          approvalId,
          approved,
          reason: approved ? "User approved tool execution" : "User denied tool execution",
        });
        return;
      }

      resume({
        approved,
      });
    });
  }

  return (
    <section className={styles.approvalPanel}>
      <div className={styles.approvalHeader}>
        <span className={styles.approvalLead}>
          <ApprovalGlyph />
          人工审批
        </span>
        <div className={styles.catalogSignals}>
          <span className={styles.riskPill}>{toolRiskLabels[registryItem?.riskLevel ?? "caution"]}</span>
          <span className={styles.approvalPill}>待确认</span>
        </div>
      </div>

      <p className={styles.approvalTitle}>将执行的动作</p>
      <p className={styles.approvalText}>{description}</p>

      <div className={styles.approvalActions}>
        <button className={styles.actionPrimary} disabled={isPending} onClick={() => respond(true)} type="button">
          批准执行
        </button>
        <button className={styles.actionDanger} disabled={isPending} onClick={() => respond(false)} type="button">
          拒绝
        </button>
      </div>
    </section>
  );
}

function ReqToolProgressTracker({
  state,
  supportsApproval,
}: {
  state: ToolInvocationViewState;
  supportsApproval: boolean;
}) {
  const steps = supportsApproval
    ? [
        { key: "input", label: "输入", caption: getToolInputCaption(state) },
        { key: "approval", label: "审批", caption: state === "denied" ? "已拒绝" : "人工确认" },
        { key: "result", label: "结果", caption: getToolResultCaption(state) },
      ]
    : [
        { key: "input", label: "输入", caption: getToolInputCaption(state) },
        { key: "execute", label: "执行", caption: getToolExecutionCaption(state) },
        { key: "result", label: "结果", caption: getToolResultCaption(state) },
      ];

  return (
    <div className={styles.progressTracker}>
      {steps.map((step) => {
        const marker = getStepMarker(step.key, state, supportsApproval);
        return (
          <div key={step.key} className={joinClasses(styles.progressStep, getProgressStepClassName(marker))}>
            <span className={joinClasses(styles.progressMarker, getProgressMarkerClassName(marker))}>
              <ProgressGlyph marker={marker} />
            </span>
            <div className={styles.progressCopy}>
              <span className={styles.progressTitle}>{step.label}</span>
              <span className={styles.progressCaption}>{step.caption}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToolGroupShell({
  activeCount,
  children,
  compact,
  count,
  label,
  status,
}: StaticToolGroupProps & {
  status: ToolGroupStatus;
}) {
  return (
    <section className={joinClasses(styles.group, status === "active" ? styles.groupActive : styles.groupSettled, compact ? styles.groupCompact : "")}>
      <div className={styles.groupHeader}>
        <span className={styles.groupBadge}>
          <StackGlyph />
          {label}
        </span>
        <span className={styles.groupSummaryInline}>{status === "active" ? `${activeCount} 个工具仍在运行` : `${count} 个工具结果`}</span>
      </div>
      <div className={styles.toolList}>{children}</div>
    </section>
  );
}

function ToolShell({
  description,
  debugInfo,
  extra,
  metrics,
  name,
  rawInput,
  rawOutput,
  state,
  summary,
  title,
}: {
  name: string;
  title?: string;
  description: string;
  summary?: string;
  state: ToolInvocationViewState;
  debugInfo?: unknown;
  metrics?: ToolMetric[];
  extra?: ReactNode;
  rawInput?: unknown;
  rawOutput?: unknown;
}) {
  const registryItem = getToolRegistryItem(name);
  const formattedDebug = useMemo(() => formatRawBlock(debugInfo), [debugInfo]);
  const formattedInput = useMemo(() => formatRawBlock(rawInput), [rawInput]);
  const formattedOutput = useMemo(() => formatRawBlock(rawOutput), [rawOutput]);
  const hasRawDetails = Boolean(formattedInput || formattedOutput || formattedDebug);
  const hasDescription = Boolean(description && description !== summary);
  const hasPanel = Boolean(extra || hasRawDetails || hasDescription);
  const [expanded, setExpanded] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  // Auto-expand when approval is needed (state may transition after mount)
  const prevState = useRef(state);
  useEffect(() => {
    if (prevState.current !== state && state === "awaiting_approval") {
      setExpanded(true);
      setRawOpen(true);
    }
    prevState.current = state;
  }, [state]);
  const lead = summary ?? description;

  const stripContent = (
    <>
      <div className={styles.toolTopline}>
        <div className={styles.toolIdentity}>
          <div className={styles.toolTitleRow}>
            <span className={styles.toolIconBadge}>
              <ToolGlyph name={name} registryItem={registryItem} />
            </span>
            <p className={styles.toolTitle}>{title ?? registryItem?.title ?? name}</p>
            <span className={`${styles.toolName} ${styles.code}`}>{name}</span>
          </div>
          <p className={styles.toolSummary}>{lead}</p>
        </div>

        <div className={styles.toolAside}>
            <span className={getStatusTokenClassName(state)}>
              <StatusGlyph state={state} />
              {getToolInvocationStateLabel(state)}
            </span>

          {hasPanel ? (
            <span className={joinClasses(styles.toolDisclosure, expanded ? styles.disclosureOpen : "")}>
              <ChevronGlyph />
            </span>
          ) : null}
        </div>
      </div>

      {metrics && metrics.length > 0 ? (
        <div className={styles.metricStrip}>
          {metrics.map((metric) => (
            <span key={`${name}-${metric.label}`} className={styles.metricToken}>
              <span className={styles.metricLabel}>{metric.label}</span>
              <span className={styles.metricValue}>{metric.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );

  return (
    <article className={joinClasses(getToolItemClassName(state), expanded ? styles.toolItemExpanded : "") }>
      {hasPanel ? (
        <button
          aria-expanded={expanded}
          className={joinClasses(styles.toolStrip, styles.toolStripInteractive, expanded ? styles.toolStripOpen : "")}
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {stripContent}
        </button>
      ) : (
        <div className={styles.toolStrip}>{stripContent}</div>
      )}

      {hasPanel ? (
        <div className={joinClasses(styles.toolPanelShell, expanded ? styles.toolPanelShellOpen : "")}>
          <div className={styles.toolPanelWrap} aria-hidden={!expanded}>
            <div className={styles.toolPanel}>
              {hasDescription ? <p className={styles.panelIntro}>{description}</p> : null}
              {extra ? <div className={styles.body}>{extra}</div> : null}

              {hasRawDetails ? (
                <div className={styles.rawSection}>
                  <button
                    aria-expanded={rawOpen}
                    className={styles.rawToggle}
                    onClick={() => setRawOpen((value) => !value)}
                    type="button"
                  >
                    {rawOpen ? "收起 input / output / debug" : "查看 input / output / debug"}
                  </button>

                  <div className={joinClasses(styles.rawPanelShell, rawOpen ? styles.rawPanelShellOpen : "")}>
                    <div className={styles.rawPanelWrap} aria-hidden={!rawOpen}>
                      <div className={styles.rawPanel}>
                        {formattedInput ? (
                          <div className={styles.rawBlock}>
                            <span className={styles.rawLabel}>Input</span>
                            <pre className={styles.rawPre}>{formattedInput}</pre>
                          </div>
                        ) : null}
                        {formattedOutput ? (
                          <div className={styles.rawBlock}>
                            <span className={styles.rawLabel}>Output</span>
                            <pre className={styles.rawPre}>{formattedOutput}</pre>
                          </div>
                        ) : null}
                        {formattedDebug ? (
                          <div className={styles.rawBlock}>
                            <span className={styles.rawLabel}>Debug</span>
                            <pre className={styles.rawPre}>{formattedDebug}</pre>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function useCurrentMessageMeta(): ReqAgentMessageMeta | null {
  return useAuiState((state) => {
    const metadata = state.message.metadata as Record<string, unknown> | undefined;
    const custom = metadata?.custom;
    return custom && typeof custom === "object" ? (custom as ReqAgentMessageMeta) : null;
  });
}

function buildToolSummary({
  registryItem,
  result,
  state,
}: {
  registryItem?: ToolRegistryItem;
  result: unknown;
  state: ToolInvocationViewState;
}) {
  if (state === "drafting_input") return "正在流式组装参数。";
  if (state === "input_ready") return "参数已收齐，等待发出。";
  if (state === "awaiting_approval") return "动作已准备就绪，等待人工确认。";
  if (state === "executing") return "工具已发出，正在等待结果。";
  if (state === "streaming_output") return "结果持续返回中。";
  if (state === "denied") return "这次调用被人工拒绝。";
  if (state === "input_invalid") return "工具输入没有通过校验。";
  if (state === "failed") return extractMessage(result) ?? `${registryItem?.title ?? "工具"}执行失败。`;
  return extractMessage(result) ?? "工具执行完成。";
}

function buildBashSummary(
  state: ToolInvocationViewState,
  command: string,
  terminal: ReturnType<typeof safeParseReqToolTerminalPayload>,
) {
  if (state === "awaiting_approval") return `等待审批执行：${truncate(command, 140)}`;
  if (state === "drafting_input") return "正在整理命令参数。";

  const preview = firstUsefulLine(terminal?.stderr) ?? firstUsefulLine(terminal?.stdout);
  if (preview) return preview;

  if (state === "failed") {
    return typeof terminal?.exitCode === "number" ? `命令失败，退出码 ${terminal.exitCode}。` : "命令执行失败。";
  }

  if (state === "succeeded") return "命令执行完成。";
  return `已发出命令：${truncate(command, 120)}`;
}

function summarizeStructuredArgs(args: unknown, argsText: string) {
  const parsed =
    args && typeof args === "object" && !Array.isArray(args) && Object.keys(args).length > 0
      ? (args as Record<string, unknown>)
      : (parseToolArgsText(argsText) ?? {});
  const entries = Object.entries(parsed);
  if (entries.length === 0) return "无参数";
  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}=${formatInlineValue(value)}`)
    .join(" · ");
}

function extractStructuredMetrics(result: unknown): ToolMetric[] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];

  const preferredKeys = ["count", "total", "charCount", "root", "query", "path", "source", "relevance"];
  const record = result as Record<string, unknown>;
  const metrics: ToolMetric[] = [];

  for (const key of preferredKeys) {
    if (!(key in record)) continue;
    const metric = toMetric(key, record[key]);
    if (metric) metrics.push(metric);
  }

  if (metrics.length > 0) return metrics.slice(0, 4);

  return Object.entries(record)
    .map(([key, value]) => toMetric(key, value))
    .filter((value): value is ToolMetric => Boolean(value))
    .slice(0, 4);
}

function toMetric(key: string, value: unknown): ToolMetric | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { label: formatMetricLabel(key), value: String(value) };
  }

  if (Array.isArray(value)) {
    return { label: formatMetricLabel(key), value: `${value.length} 项` };
  }

  return null;
}

function extractPlan(result: unknown): Array<{ label: string; detail?: string }> | null {
  if (!result || typeof result !== "object") return null;
  const steps = (result as Record<string, unknown>).steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const normalized = steps
    .map((step) => {
      if (typeof step === "string") return { label: step };
      if (step && typeof step === "object" && "label" in step && typeof (step as { label: unknown }).label === "string") {
        return {
          label: (step as { label: string }).label,
          detail: "detail" in step && typeof (step as { detail?: unknown }).detail === "string" ? (step as { detail: string }).detail : undefined,
        };
      }
      return null;
    })
    .filter((value): value is { label: string; detail?: string } => Boolean(value));

  return normalized.length > 0 ? normalized : null;
}

function isAvailableToolsResult(result: unknown): result is AvailableToolsResult {
  if (!result || typeof result !== "object") return false;
  const candidate = result as Partial<AvailableToolsResult>;
  return typeof candidate.total === "number" && Array.isArray(candidate.groups);
}

function formatMetricLabel(key: string) {
  const dictionary: Record<string, string> = {
    count: "数量",
    total: "总数",
    charCount: "字符数",
    root: "目录",
    query: "查询",
    path: "路径",
    source: "来源",
    relevance: "相关度",
  };

  return dictionary[key] ?? key;
}

function formatInlineValue(value: unknown) {
  if (typeof value === "string") return truncate(JSON.stringify(value), 24);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} 项`;
  if (value && typeof value === "object") return "对象";
  return "空";
}

function getStepMarker(step: string, state: ToolInvocationViewState, supportsApproval: boolean): ProgressMarker {
  if (state === "failed" || state === "input_invalid") {
    return step === "result" || step === "input" ? "error" : "idle";
  }

  if (state === "denied") {
    return step === "approval" || step === "result" ? "error" : step === "input" ? "done" : "idle";
  }

  if (supportsApproval) {
    if (step === "input") {
      return state === "drafting_input"
        ? "active"
        : state === "input_ready" || state === "awaiting_approval" || state === "succeeded" || state === "executing" || state === "streaming_output"
          ? "done"
          : "idle";
    }

    if (step === "approval") {
      return state === "awaiting_approval" ? "active" : state === "executing" || state === "streaming_output" || state === "succeeded" ? "done" : "idle";
    }

    return state === "streaming_output" ? "active" : state === "succeeded" ? "done" : "idle";
  }

  if (step === "input") {
    return state === "drafting_input" ? "active" : state === "executing" || state === "streaming_output" || state === "succeeded" ? "done" : "idle";
  }

  if (step === "execute") {
    return state === "executing" || state === "streaming_output" ? "active" : state === "succeeded" ? "done" : "idle";
  }

  return state === "streaming_output" ? "active" : state === "succeeded" ? "done" : "idle";
}

function extractMessage(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;
  const keys = ["summary", "message", "pattern", "path", "query", "error"];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return truncate(value.trim(), 120);
    }
  }
  return null;
}

function formatRawBlock(value: unknown) {
  if (value === undefined) return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function firstUsefulLine(value?: string) {
  if (!value) return null;
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? truncate(firstLine, 120) : null;
}

function countLines(value?: string) {
  if (!value) return 0;
  const trimmed = value.replace(/\n+$/, "");
  return trimmed ? trimmed.split("\n").length : 0;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function getToolItemClassName(state: ToolInvocationViewState) {
  const mapping: Record<ToolInvocationViewState, string> = {
    drafting_input: styles.toolDrafting,
    input_ready: styles.toolReady,
    input_invalid: styles.toolInvalid,
    awaiting_approval: styles.toolApproval,
    executing: styles.toolExecuting,
    streaming_output: styles.toolStreaming,
    succeeded: styles.toolSucceeded,
    denied: styles.toolDenied,
    failed: styles.toolFailed,
  };

  return joinClasses(styles.toolItem, mapping[state]);
}

function getStatusTokenClassName(state: ToolInvocationViewState) {
  const mapping: Record<ToolInvocationViewState, string> = {
    drafting_input: styles.statusRunning,
    input_ready: styles.statusReady,
    input_invalid: styles.statusInvalid,
    awaiting_approval: styles.statusApproval,
    executing: styles.statusRunning,
    streaming_output: styles.statusRunning,
    succeeded: styles.statusSucceeded,
    denied: styles.statusDenied,
    failed: styles.statusFailed,
  };

  return joinClasses(styles.toolStatus, mapping[state]);
}

function getProgressStepClassName(marker: ProgressMarker) {
  return marker === "done"
    ? styles.progressStepDone
    : marker === "active"
      ? styles.progressStepActive
      : marker === "error"
        ? styles.progressStepError
        : "";
}

function getProgressMarkerClassName(marker: ProgressMarker) {
  return marker === "done"
    ? styles.progressMarkerDone
    : marker === "active"
      ? styles.progressMarkerActive
      : marker === "error"
        ? styles.progressMarkerError
        : "";
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function ToolGlyph({ name, registryItem, className }: { name: string; registryItem?: ToolRegistryItem; className?: string }) {
  const normalizedName = name.toLowerCase();

  if (normalizedName === "bash") return <TerminalGlyph className={className} />;
  if (normalizedName === "search_knowledge") return <KnowledgeGlyph className={className} />;
  if (normalizedName === "search_workspace") return <SearchGlyph className={className} />;
  if (normalizedName === "list_files") return <FolderGlyph className={className} />;
  if (normalizedName === "readfile") return <FileGlyph className={className} />;
  if (normalizedName === "writefile") return <WriteGlyph className={className} />;
  if (normalizedName === "list_available_tools") return <GridGlyph className={className} />;
  if (normalizedName.includes("plan")) return <PlanGlyph className={className} />;
  if (normalizedName.includes("search")) return <SearchGlyph className={className} />;
  if (normalizedName.includes("write")) return <WriteGlyph className={className} />;
  if (normalizedName.includes("read")) return <FileGlyph className={className} />;
  if (normalizedName.includes("file")) return <FolderGlyph className={className} />;

  switch (registryItem?.rendererKind) {
    case "terminal":
      return <TerminalGlyph className={className} />;
    case "catalog":
      return <GridGlyph className={className} />;
    default:
      break;
  }

  switch (registryItem?.category) {
    case "workspace":
      return <FolderGlyph className={className} />;
    case "execution":
      return <WriteGlyph className={className} />;
    case "interaction":
      return <ApprovalGlyph className={className} />;
    case "structured":
      return <KnowledgeGlyph className={className} />;
    default:
      return <FallbackGlyph className={className} />;
  }
}

function StatusGlyph({ state }: { state: ToolInvocationViewState }) {
  switch (state) {
    case "drafting_input":
      return <DraftGlyph />;
    case "input_ready":
      return <ReadyGlyph />;
    case "input_invalid":
      return <WarningGlyph />;
    case "awaiting_approval":
      return <ApprovalGlyph />;
    case "executing":
      return <SpinnerGlyph className={styles.spinningGlyph} />;
    case "streaming_output":
      return <StreamGlyph />;
    case "succeeded":
      return <CheckGlyph />;
    case "denied":
      return <BlockedGlyph />;
    case "failed":
      return <ErrorGlyph />;
  }
}

function ProgressGlyph({ marker }: { marker: ProgressMarker }) {
  if (marker === "active") return <SpinnerGlyph className={styles.spinningGlyph} />;
  if (marker === "done") return <CheckGlyph />;
  if (marker === "error") return <ErrorGlyph />;
  return <DotGlyph />;
}

function glyphProps(className?: string): SVGProps<SVGSVGElement> {
  return {
    className: joinClasses(styles.glyph, className),
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
      <path d="M11 8.5v5" />
      <path d="M8.5 11H13.5" />
    </svg>
  );
}

function KnowledgeGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M6 5.5h9a3 3 0 0 1 3 3v10H9a3 3 0 0 0-3 3Z" />
      <path d="M6 5.5v16" />
      <path d="M10 10h4" />
      <path d="M10 13h4" />
    </svg>
  );
}

function FolderGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M3.5 7.5h5l2 2h10v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
      <path d="M3.5 7.5v-1a2 2 0 0 1 2-2H9l2 2" />
    </svg>
  );
}

function FileGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M7 3.5h7l4 4v12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5v-14A2 2 0 0 1 7 3.5Z" />
      <path d="M14 3.5v4h4" />
      <path d="M9 12h6" />
      <path d="M9 15.5h4.5" />
    </svg>
  );
}

function WriteGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m4.5 17.5 1.5-4.5L14.5 4.5a2.12 2.12 0 0 1 3 3L9 16l-4.5 1.5Z" />
      <path d="M12.5 6.5 17 11" />
      <path d="M5 19h14" />
    </svg>
  );
}

function TerminalGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="m7.5 10 2.5 2.5L7.5 15" />
      <path d="M12.5 15h4" />
    </svg>
  );
}

function GridGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function ApprovalGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M12 3.5 18.5 6v5.5c0 4.2-2.4 7.2-6.5 9-4.1-1.8-6.5-4.8-6.5-9V6Z" />
      <path d="m9.5 12 1.7 1.7 3.3-3.7" />
    </svg>
  );
}

function PlanGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M7 5h10" />
      <path d="M7 12h10" />
      <path d="M7 19h10" />
      <circle cx="4.5" cy="5" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="19" r="1" />
    </svg>
  );
}

function FallbackGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m12 3.5 7 4v9l-7 4-7-4v-9Z" />
      <path d="m12 8.5 0 7" />
      <path d="M12 17.5h.01" />
    </svg>
  );
}

function DraftGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m6 17 1.4-4.2L14.8 5.4a1.8 1.8 0 0 1 2.5 2.5l-7.4 7.4Z" />
      <path d="M13 7 17 11" />
    </svg>
  );
}

function ReadyGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="m8.5 12 2.3 2.3L15.5 9.5" />
    </svg>
  );
}

function StreamGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M3.5 12h3l2-4 4 8 2-4h6" />
    </svg>
  );
}

function CheckGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m5.5 12.5 4 4L18.5 7.5" />
    </svg>
  );
}

function WarningGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m12 4 8 15H4Z" />
      <path d="M12 9v4.5" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function BlockedGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.2 15.8 7.6-7.6" />
    </svg>
  );
}

function ErrorGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m7 7 10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}

function DotGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function SpinnerGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="M12 4a8 8 0 1 1-5.7 2.3" />
    </svg>
  );
}

function StackGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m12 4 8 4-8 4-8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </svg>
  );
}

function ChevronGlyph({ className }: { className?: string }) {
  return (
    <svg {...glyphProps(className)}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}

export function getToolCategoryLabel(category: keyof typeof toolCategoryLabels) {
  return toolCategoryLabels[category];
}
