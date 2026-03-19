import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from "ai";
import {
  buildConversationText,
  buildFailureMessage,
  buildStageSequence,
  classifyWorkflowError,
  createRunState,
  detectRequestedStage,
  evaluateClarification,
  generateDocument,
  generateStories,
  parseRequirement,
  resolveExecutionPlan,
  searchKnowledge,
  summarizeFinalResult,
} from "@/lib/workflow";
import { reqAgentToolNames } from "@/lib/tools";
import {
  type ReqAgentErrorKind,
  getLatestReqAgentThreadState,
  type ReqAgentRole,
  type ReqAgentStage,
  type ReqAgentThreadState,
  type ReqAgentUIMessage,
} from "@/lib/types";

export const maxDuration = 60;

type RequestBody = {
  messages?: ReqAgentUIMessage[];
};

type ToolName = (typeof reqAgentToolNames)[keyof typeof reqAgentToolNames];

function createRunId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `run-${crypto.randomUUID()}`
    : `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function writeText(writer: UIMessageStreamWriter<ReqAgentUIMessage>, text: string) {
  const id = `text-${createRunId()}`;
  writer.write({ type: "text-start", id });
  writer.write({ type: "text-delta", id, delta: text });
  writer.write({ type: "text-end", id });
}

function updateStageState(
  state: ReqAgentThreadState,
  {
    stage,
    role,
    workflowStatus,
    stageStatus,
    publicThinking,
    threadTitle,
    errorKind,
    errorMessage,
  }: {
    stage: ReqAgentStage | null;
    role: ReqAgentRole | null;
    workflowStatus: ReqAgentThreadState["workflowStatus"];
    stageStatus?: ReqAgentThreadState["pipeline"][ReqAgentStage];
    publicThinking: string;
    threadTitle?: string;
    errorKind?: ReqAgentErrorKind;
    errorMessage?: string;
  },
) {
  return {
    ...state,
    workflowStatus,
    activeStage: stage,
    activeRole: role,
    publicThinking,
    threadTitle: threadTitle ?? state.threadTitle,
    pipeline:
      stage && stageStatus
        ? {
            ...state.pipeline,
            [stage]: stageStatus,
          }
        : state.pipeline,
    errorKind,
    errorMessage,
  };
}

function writeMetadata(writer: UIMessageStreamWriter<ReqAgentUIMessage>, state: ReqAgentThreadState) {
  writer.write({
    type: "message-metadata",
    messageMetadata: state,
  });
}

function writeToolStart(
  writer: UIMessageStreamWriter<ReqAgentUIMessage>,
  toolName: ToolName,
  input: unknown,
) {
  const toolCallId = `${toolName}-${createRunId()}`;

  writer.write({
    type: "tool-input-start",
    toolCallId,
    toolName,
  });
  writer.write({
    type: "tool-input-available",
    toolCallId,
    toolName,
    input,
  });

  return toolCallId;
}

function writeToolSuccess(
  writer: UIMessageStreamWriter<ReqAgentUIMessage>,
  toolCallId: string,
  output: unknown,
) {
  writer.write({
    type: "tool-output-available",
    toolCallId,
    output,
  });
}

function writeToolFailure(
  writer: UIMessageStreamWriter<ReqAgentUIMessage>,
  toolCallId: string,
  errorText: string,
) {
  writer.write({
    type: "tool-output-error",
    toolCallId,
    errorText,
  });
}

function extractLatestUserText(messages: ReqAgentUIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role !== "user") {
      continue;
    }

    const text = (message.parts ?? [])
      .filter((part): part is (typeof message.parts)[number] & { type: "text"; text: string } => part.type === "text" && "text" in part && typeof part.text === "string")
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

export async function POST(req: Request) {
  const { messages }: RequestBody = await req.json();

  if (!messages || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const latestUserText = extractLatestUserText(messages);
  if (!latestUserText) {
    return new Response("Missing user text", { status: 400 });
  }

  const previousState = getLatestReqAgentThreadState(messages);
  const runId = createRunId();
  const conversationText = buildConversationText(messages);

  const stream = createUIMessageStream<ReqAgentUIMessage>({
    execute: async ({ writer }) => {
      let state = createRunState(previousState, runId, latestUserText);

      writer.write({
        type: "start",
        messageMetadata: state,
      });

      try {
        const requestedStage = detectRequestedStage(latestUserText);
        const shouldClarify =
          requestedStage == null ||
          requestedStage === "parse" ||
          (requestedStage === "decompose" && !previousState?.artifacts.brief) ||
          (requestedStage === "document" && !previousState?.artifacts.stories);

        console.error("[reqagent] request received", {
          requestedStage,
          shouldClarify,
          latestUserText,
          previousRunId: previousState?.runId ?? null,
        });

        if (shouldClarify) {
          console.error("[reqagent] stage start", { stage: "clarify" });
          state = updateStageState(state, {
            stage: "clarify",
            role: "Orchestrator",
            workflowStatus: "running",
            stageStatus: "running",
            publicThinking: "正在判断当前信息是否足够进入需求分析流程。",
            errorKind: undefined,
            errorMessage: undefined,
          });
          writeMetadata(writer, state);

          const clarification = await evaluateClarification({
            latestUserText,
            conversationText,
            previousState,
          });
          console.error("[reqagent] stage complete", {
            stage: "clarify",
            needsClarification: clarification.needsClarification,
          });

          if (clarification.needsClarification) {
            state = updateStageState(state, {
              stage: "clarify",
              role: "Orchestrator",
              workflowStatus: "awaiting_input",
              stageStatus: "awaiting_input",
              publicThinking: clarification.publicThinking,
              threadTitle: clarification.threadTitle,
              errorKind: undefined,
              errorMessage: undefined,
            });
            writeMetadata(writer, state);
            writeText(writer, clarification.questions.map((question, index) => `${index + 1}. ${question}`).join("\n"));
            writer.write({
              type: "finish",
              finishReason: "stop",
              messageMetadata: state,
            });
            return;
          }

          state = updateStageState(state, {
            stage: "clarify",
            role: "Orchestrator",
            workflowStatus: "running",
            stageStatus: "complete",
            publicThinking: clarification.publicThinking,
            threadTitle: clarification.threadTitle,
            errorKind: undefined,
            errorMessage: undefined,
          });
          writeMetadata(writer, state);
        }

        const { mode, startStage } = resolveExecutionPlan(previousState, latestUserText, requestedStage);
        const stageSequence = buildStageSequence(startStage, mode);
        let brief = previousState?.artifacts.brief;
        let stories = previousState?.artifacts.stories;

        for (const stage of stageSequence) {
          if (stage === "parse") {
            console.error("[reqagent] stage start", { stage });
            state = updateStageState(state, {
              stage,
              role: "InputParser",
              workflowStatus: "running",
              stageStatus: "running",
              publicThinking: "InputParser 正在把当前线程需求整理成结构化 brief。",
              errorKind: undefined,
              errorMessage: undefined,
            });
            writeMetadata(writer, state);

            const toolCallId = writeToolStart(writer, reqAgentToolNames.parseInput, {
              raw_input: latestUserText,
              conversation: conversationText,
            });

            try {
              brief = await parseRequirement({
                latestUserText,
                conversationText,
                previousState,
              });
              console.error("[reqagent] stage complete", { stage, projectName: brief.projectName });
              writeToolSuccess(writer, toolCallId, brief);
            } catch (error) {
              writeToolFailure(writer, toolCallId, error instanceof Error ? error.message : "parse_input failed");
              throw error;
            }

            state = {
              ...updateStageState(state, {
                stage,
                role: "InputParser",
                workflowStatus: "running",
                stageStatus: "complete",
                publicThinking: "结构化 brief 已更新，正在准备后续拆解。",
                threadTitle: brief.projectName,
                errorKind: undefined,
                errorMessage: undefined,
              }),
              artifacts: {
                ...state.artifacts,
                brief,
              },
            };
            writeMetadata(writer, state);
            continue;
          }

          if (stage === "decompose") {
            console.error("[reqagent] stage start", { stage });
            if (!brief) {
              throw new Error("Missing brief before decompose stage.");
            }

            state = updateStageState(state, {
              stage,
              role: "ReqDecomposer",
              workflowStatus: "running",
              stageStatus: "running",
              publicThinking: "ReqDecomposer 正在检索模式并拆解用户故事。",
              errorKind: undefined,
              errorMessage: undefined,
            });
            writeMetadata(writer, state);

            const knowledgeCallId = writeToolStart(writer, reqAgentToolNames.searchKnowledge, {
              query: `${brief.projectName} ${brief.coreFeatures.join(" ")}`.trim(),
            });
            const knowledgeQuery = `${brief.projectName} ${brief.coreFeatures.join(" ")}`.trim();
            let knowledge: ReturnType<typeof searchKnowledge>;

            try {
              knowledge = searchKnowledge(knowledgeQuery);
              console.error("[reqagent] stage progress", { stage, tool: "search_knowledge" });
              writeToolSuccess(writer, knowledgeCallId, knowledge);
            } catch (error) {
              writeToolFailure(writer, knowledgeCallId, error instanceof Error ? error.message : "search_knowledge failed");
              throw error;
            }

            const storiesCallId = writeToolStart(writer, reqAgentToolNames.generateStories, {
              project_name: brief.projectName,
            });

            try {
              const result = await generateStories({
                latestUserText,
                requirement: brief,
                previousState,
                knowledge,
              });
              stories = result.stories;
              console.error("[reqagent] stage complete", { stage, stories: stories.total });
              writeToolSuccess(writer, storiesCallId, stories);
            } catch (error) {
              writeToolFailure(writer, storiesCallId, error instanceof Error ? error.message : "generate_stories failed");
              throw error;
            }

            state = {
              ...updateStageState(state, {
                stage,
                role: "ReqDecomposer",
                workflowStatus: "running",
                stageStatus: "complete",
                publicThinking: "用户故事已更新，正在整理最终交付。",
                errorKind: undefined,
                errorMessage: undefined,
              }),
              artifacts: {
                ...state.artifacts,
                stories,
              },
            };
            writeMetadata(writer, state);
            continue;
          }

          if (stage === "document") {
            console.error("[reqagent] stage start", { stage });
            if (!brief || !stories) {
              throw new Error("Missing brief or stories before document stage.");
            }

            state = updateStageState(state, {
              stage,
              role: "DocGenerator",
              workflowStatus: "running",
              stageStatus: "running",
              publicThinking: "DocGenerator 正在生成 Markdown 需求文档。",
              errorKind: undefined,
              errorMessage: undefined,
            });
            writeMetadata(writer, state);

            const toolCallId = writeToolStart(writer, reqAgentToolNames.generateDoc, {
              projectName: brief.projectName,
            });

            try {
              const doc = await generateDocument({
                latestUserText,
                requirement: brief,
                stories,
                previousState,
              });
              console.error("[reqagent] stage complete", { stage, charCount: doc.charCount });
              writeToolSuccess(writer, toolCallId, doc);
              state = {
                ...state,
                artifacts: {
                  ...state.artifacts,
                  doc,
                },
              };
            } catch (error) {
              writeToolFailure(writer, toolCallId, error instanceof Error ? error.message : "generate_doc failed");
              throw error;
            }

            state = updateStageState(state, {
              stage,
              role: "DocGenerator",
              workflowStatus: "running",
              stageStatus: "complete",
              publicThinking: "需求文档已生成，正在整理最终回复。",
              errorKind: undefined,
              errorMessage: undefined,
            });
            writeMetadata(writer, state);
          }
        }

        state = updateStageState(state, {
          stage: stageSequence.at(-1) ?? null,
          role:
            stageSequence.at(-1) === "document"
              ? "DocGenerator"
              : stageSequence.at(-1) === "decompose"
                ? "ReqDecomposer"
                : stageSequence.at(-1) === "parse"
                  ? "InputParser"
                  : "Orchestrator",
          workflowStatus: "completed",
          publicThinking: "本轮需求分析已完成。",
          errorKind: undefined,
          errorMessage: undefined,
        });
        writeMetadata(writer, state);
        writeText(writer, summarizeFinalResult(stageSequence, state.artifacts));
        writer.write({
          type: "finish",
          finishReason: "stop",
          messageMetadata: state,
        });
      } catch (error) {
        const failure = classifyWorkflowError(error);
        console.error("[reqagent] workflow failed", {
          stage: state.activeStage,
          role: state.activeRole,
          errorKind: failure.kind,
          error,
        });
        state = updateStageState(state, {
          stage: state.activeStage,
          role: state.activeRole,
          workflowStatus: "failed",
          stageStatus: state.activeStage ? "failed" : undefined,
          publicThinking: buildFailureMessage(state.activeStage, failure.kind),
          errorKind: failure.kind,
          errorMessage: failure.message,
        });
        writeMetadata(writer, state);
        writeText(
          writer,
          failure.message && failure.message !== buildFailureMessage(state.activeStage, failure.kind)
            ? `${buildFailureMessage(state.activeStage, failure.kind)}\n\n错误详情：${failure.message}`
            : buildFailureMessage(state.activeStage, failure.kind),
        );
        writer.write({
          type: "finish",
          finishReason: "error",
          messageMetadata: state,
        });
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
  });
}
