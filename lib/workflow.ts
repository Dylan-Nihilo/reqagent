import { z } from "zod";
import { getReqAgentProviderInfo } from "@/lib/provider-config";
import { generateResponsesObject, generateResponsesText } from "@/lib/responses-client";
import {
  createReqAgentPipeline,
  createReqAgentThreadState,
  reqAgentStageLabels,
  type KnowledgeSearchResult,
  type ReqAgentErrorKind,
  type ReqAgentStage,
  type ReqAgentThreadState,
  type StoryGenerationResult,
  type StructuredRequirement,
} from "@/lib/types";
import {
  buildStoryGenerationResult,
  clarifyDecisionSchema,
  detectDomain,
  detectProjectName,
  generateStoriesSchema,
  parseResultSchema,
  searchKnowledgePatterns,
  summarizeRequirement,
  withDocumentMetrics,
} from "@/lib/tools";

export type WorkflowExecutionMode = "single-stage" | "full-run";

export type WorkflowFailure = {
  kind: ReqAgentErrorKind;
  message: string;
};

async function generateStructuredOutput<T>({
  schema,
  schemaName,
  system,
  prompt,
}: {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  prompt: string;
}) {
  return await generateResponsesObject({
    schema,
    schemaName,
    system,
    prompt,
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Unknown error.";
}

export function classifyWorkflowError(error: unknown): WorkflowFailure {
  if (error instanceof SyntaxError) {
    return {
      kind: "invalid_json",
      message: "模型返回了无法解析的 JSON。",
    };
  }

  if (error instanceof z.ZodError) {
    return {
      kind: "schema_validation",
      message: "模型返回的结构不符合预期 schema。",
    };
  }

  const message = getErrorMessage(error);

  if (
    /(fetch failed|network|timed out|timeout|socket hang up|ECONN|ENOTFOUND|getaddrinfo|dns|connect)/i.test(
      message,
    )
  ) {
    return {
      kind: "provider_network",
      message,
    };
  }

  if (
    /(empty response|response body|stream|protocol|invalid response|unexpected response|status code|malformed|invalid_json_schema|invalid_request_error)/i.test(
      message,
    )
  ) {
    return {
      kind: "provider_protocol",
      message,
    };
  }

  return {
    kind: "internal_error",
    message,
  };
}

export function createRunState(previousState: ReqAgentThreadState | null, runId: string, latestUserText: string): ReqAgentThreadState {
  return createReqAgentThreadState({
    runId,
    workflowStatus: "running",
    threadTitle: previousState?.threadTitle || detectProjectName(latestUserText),
    pipeline: createReqAgentPipeline(),
    artifacts: previousState?.artifacts ?? {},
    providerInfo: getReqAgentProviderInfo(),
  });
}

export function detectRequestedStage(text: string): ReqAgentStage | null {
  const source = text.toLowerCase();

  if (/重做.*文档|重新生成.*文档|重写.*文档|文档重做|regenerate.*doc|redo.*doc/.test(source)) {
    return "document";
  }

  if (/重做.*故事|重新生成.*故事|重做.*story|重新生成.*story|用户故事|stories|story/.test(source)) {
    return "decompose";
  }

  if (/重做.*brief|重新解析|重做.*需求概要|重做.*结构化需求|brief/.test(source)) {
    return "parse";
  }

  return null;
}

export function resolveExecutionPlan(
  previousState: ReqAgentThreadState | null,
  latestUserText: string,
  requestedStage: ReqAgentStage | null,
): {
  mode: WorkflowExecutionMode;
  startStage: Exclude<ReqAgentStage, "clarify">;
} {
  if (requestedStage === "document" && previousState?.artifacts.stories) {
    return { mode: "single-stage", startStage: "document" };
  }

  if (requestedStage === "decompose" && previousState?.artifacts.brief) {
    return { mode: "single-stage", startStage: "decompose" };
  }

  if (requestedStage === "parse") {
    return { mode: "single-stage", startStage: "parse" };
  }

  if (previousState?.artifacts.brief && !previousState.artifacts.stories) {
    return { mode: "full-run", startStage: "decompose" };
  }

  if (previousState?.artifacts.stories && !previousState.artifacts.doc) {
    return { mode: "full-run", startStage: "document" };
  }

  if (previousState?.artifacts.brief && previousState.workflowStatus === "completed" && latestUserText.trim().length > 0) {
    return { mode: "full-run", startStage: "parse" };
  }

  return { mode: "full-run", startStage: "parse" };
}

export function buildStageSequence(
  startStage: Exclude<ReqAgentStage, "clarify">,
  mode: WorkflowExecutionMode,
): Array<Exclude<ReqAgentStage, "clarify">> {
  if (mode === "single-stage") {
    return [startStage];
  }

  switch (startStage) {
    case "parse":
      return ["parse", "decompose", "document"];
    case "decompose":
      return ["decompose", "document"];
    case "document":
      return ["document"];
  }
}

export async function evaluateClarification(options: {
  latestUserText: string;
  conversationText: string;
  previousState: ReqAgentThreadState | null;
}) {
  const { latestUserText, conversationText, previousState } = options;

  return await generateStructuredOutput({
    schema: clarifyDecisionSchema,
    schemaName: "clarify_decision",
    system: `你是 ReqAgent 的 Orchestrator。

任务：
- 判断当前信息是否足够进入需求分析流程。
- 如果不足，只提出最多 2 个真正影响方案的问题。
- 如果已有历史 brief、stories 或文档，用户的新补充默认是对现有线程的 refinement，不要轻易退回到大范围追问。

判断标准：
- 至少要知道产品目标、主要用户或角色、核心功能方向。
- 如果关键约束、权限边界、成功标准明显缺失，并且会影响需求拆解结果，再追问。

输出要求：
- 使用中文。
- \`threadTitle\` 给出一个简短稳定的会话标题。
- \`publicThinking\` 只能写可展示给用户的公开进度文案，不能暴露推理细节。`,
    prompt: [
      "最近一条用户输入：",
      latestUserText,
      "",
      "当前线程用户上下文：",
      conversationText || "无",
      "",
      "上一轮线程状态：",
      previousState ? JSON.stringify(previousState.artifacts, null, 2) : "无历史产物",
    ].join("\n"),
  });
}

export async function parseRequirement(options: {
  latestUserText: string;
  conversationText: string;
  previousState: ReqAgentThreadState | null;
}) {
  const { latestUserText, conversationText, previousState } = options;

  return (await generateStructuredOutput({
    schema: parseResultSchema,
    schemaName: "parse_result",
    system: `你是 InputParser。

任务：
- 把需求上下文整理成结构化 brief。
- 如果当前线程已有 brief，而用户在补充或修正内容，请输出更新后的完整 brief，而不是只输出增量。
- 默认使用中文，但保留原始产品名中的英文术语。

输出要求：
- \`projectName\` 简短稳定。
- \`coreFeatures\` 保持 3-6 条最重要能力。
- \`ambiguities\` 只保留真正影响后续拆解的歧义。`,
    prompt: [
      "最近一条用户输入：",
      latestUserText,
      "",
      "当前线程用户上下文：",
      conversationText || "无",
      "",
      "已有 brief：",
      previousState?.artifacts.brief ? JSON.stringify(previousState.artifacts.brief, null, 2) : "无",
    ].join("\n"),
  })) as StructuredRequirement;
}

export async function generateStories(options: {
  latestUserText: string;
  requirement: StructuredRequirement;
  previousState: ReqAgentThreadState | null;
  knowledge: KnowledgeSearchResult;
}) {
  const { latestUserText, requirement, previousState, knowledge } = options;

  const storiesDraft = await generateStructuredOutput({
    schema: generateStoriesSchema,
    schemaName: "generate_stories",
    system: `你是 ReqDecomposer。

任务：
- 根据结构化 brief 输出一组可交付的用户故事。
- 每条 story 使用 As a / I want / so that 结构。
- 每条 story 至少 1 条 Given / When / Then 验收标准。
- Must Have 数量尽量不超过总数的 40%。
- 如果当前线程已有 stories，而用户在补充需求，请返回更新后的完整 stories 集合。`,
    prompt: [
      "最新用户补充：",
      latestUserText,
      "",
      "结构化 brief：",
      JSON.stringify(requirement, null, 2),
      "",
      "领域模式参考：",
      JSON.stringify(knowledge, null, 2),
      "",
      "已有 stories：",
      previousState?.artifacts.stories ? JSON.stringify(previousState.artifacts.stories, null, 2) : "无",
    ].join("\n"),
  });

  return {
    stories: buildStoryGenerationResult(storiesDraft.projectName, storiesDraft.stories),
  };
}

export function searchKnowledge(query: string) {
  return searchKnowledgePatterns(query, detectDomain(query));
}

export async function generateDocument(options: {
  latestUserText: string;
  requirement: StructuredRequirement;
  stories: StoryGenerationResult;
  previousState: ReqAgentThreadState | null;
}) {
  const { latestUserText, requirement, stories, previousState } = options;

  const result = await generateResponsesText({
    system: `你是 DocGenerator。

任务：
- 根据 brief 和 stories 生成完整的 Markdown 需求规格说明书。
- 默认使用中文。
- 文档必须包含：项目概述、角色与范围、功能需求、非功能需求、依赖与风险、优先级摘要、术语表、Mermaid 流程图。
- 直接输出 Markdown，不要输出额外解释。`,
    prompt: [
      "最新用户补充：",
      latestUserText,
      "",
      "结构化 brief：",
      JSON.stringify(requirement, null, 2),
      "",
      "用户故事：",
      JSON.stringify(stories, null, 2),
      "",
      "已有文档：",
      previousState?.artifacts.doc?.content ?? "无",
    ].join("\n"),
  });

  return withDocumentMetrics(requirement.projectName, result);
}

export function buildConversationText(messages: Array<{ role?: string; parts?: Array<{ type?: string; text?: string }> }>) {
  return messages
    .filter((message) => message.role === "user")
    .map((message) =>
      (message.parts ?? [])
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text?.trim() ?? "")
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function summarizeFinalResult(stageSequence: Array<Exclude<ReqAgentStage, "clarify">>, artifacts: ReqAgentThreadState["artifacts"]) {
  const lastStage = stageSequence.at(-1);

  if (lastStage === "document" && artifacts.doc && artifacts.stories) {
    return `已完成本轮需求拆解，stories 和 Markdown 文档都已更新。当前项目：${artifacts.doc.projectName}。`;
  }

  if (lastStage === "document" && artifacts.doc) {
    return `需求文档已重新生成，当前项目：${artifacts.doc.projectName}。`;
  }

  if (lastStage === "decompose" && artifacts.stories) {
    return `用户故事已更新，共 ${artifacts.stories.total} 条，后续可以继续生成文档。`;
  }

  if (lastStage === "parse" && artifacts.brief) {
    return `结构化 brief 已更新：${summarizeRequirement(artifacts.brief)}`;
  }

  return "本轮处理已完成。";
}

export function buildFailureMessage(stage: ReqAgentStage | null, errorKind: ReqAgentErrorKind) {
  const stageLabel = stage ? reqAgentStageLabels[stage] : "当前处理";

  switch (errorKind) {
    case "provider_network":
      return `${stageLabel}失败：provider 网络请求异常。`;
    case "provider_protocol":
      return `${stageLabel}失败：provider 响应协议异常。`;
    case "invalid_json":
      return `${stageLabel}失败：模型返回了无效 JSON。`;
    case "schema_validation":
      return `${stageLabel}失败：模型返回结果不符合预期结构。`;
    case "internal_error":
    default:
      return `${stageLabel}失败：服务端内部处理异常。`;
  }
}
