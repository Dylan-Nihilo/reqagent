import {
  streamText,
  generateText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { getProviderInfo, reqAgentModel } from "@/lib/ai-provider";
import {
  ensureThread,
  getThreadWorkspaceId,
  syncThreadUiMessages,
} from "@/lib/db/store";
import { buildMcpRuntime } from "@/lib/mcp";
import { buildSkillRuntime, listSkills } from "@/lib/skills/loader";
import { matchSkillsForMessage } from "@/lib/skills/matcher";
import type { ToolInvocationViewState } from "@/lib/types";
import {
  ensureWorkspaceDirectory,
  readNonEmptyString,
  resolveRuntimeContext,
} from "@/lib/workspace/context";
import { buildMetadataHandler } from "@/lib/workspace/streaming-metadata";
import { buildWorkspaceTools } from "@/lib/workspace/workspace-tools";
import { buildDocxTools } from "@/lib/workspace/docx-tools";
import { buildDocxClarificationHint, getDocxClarificationState } from "@/lib/docx-workflow";

export const maxDuration = 60;

const SYSTEM_PROMPT = `你是 ReqAgent，一个 AI 助手。用中文回复，代码和路径保持英文。

重要：如果用户只是打招呼、闲聊、问一般知识性问题，直接用文字回复，不要调用任何工具。只在用户明确要求操作文件、搜索内容、执行命令或访问外部资源时才使用工具。

可用工具（仅在需要时使用）：
- list_files: 查看工作区目录结构。
- search_workspace: 全文搜索工作区文件。
- readFile: 读取文件内容。
- writeFile: 写入/修改文件。
- fetch_url: 抓取网页内容。
- bash: 执行 shell 命令。
- parse_docx: 深度读取 .docx 文件，提取标题、表格、样式和目录等结构。
- export_docx: 将 Markdown 导出为 .docx。优先先写入 docs/requirements.md，再通过 sourcePath 导出。
- list_available_tools: 查看可用工具列表。

工作原则：
1. 简单对话直接回复，不调工具
2. 需要了解项目时 → list_files，再针对性 readFile
3. 搜索内容 → search_workspace
4. 文件读写 → readFile / writeFile
5. 系统命令 → bash
6. 外部系统 → 对应 MCP 工具`;

export async function POST(req: Request) {
  const body = await req.json();
  const uiMessages = Array.isArray((body as { messages?: unknown }).messages)
    ? ((body as { messages?: UIMessage[] }).messages ?? [])
    : [];
  const requestedThreadId = readNonEmptyString((body as { threadId?: unknown }).threadId);
  const persistedWorkspaceId = requestedThreadId
    ? getThreadWorkspaceId(requestedThreadId)
    : null;
  const providerInfo = getProviderInfo();
  const { threadId, threadKey, workspaceId, workspaceKey, workspaceDir } = resolveRuntimeContext({
    ...(body as {
      workspaceId?: unknown;
      threadId?: unknown;
      localThreadId?: unknown;
      id?: unknown;
      messageId?: unknown;
      messages?: unknown;
    }),
    workspaceId: readNonEmptyString((body as { workspaceId?: unknown }).workspaceId) ?? persistedWorkspaceId,
  });
  const persistedThread = ensureThread({
    threadId,
    workspaceId,
  });

  if (uiMessages.length > 0) {
    syncThreadUiMessages(persistedThread.id, uiMessages);
  }

  // Auto-load all available skills — agent-native: AI decides what to use
  const allSkillManifests = await listSkills();
  const allSkillIds = allSkillManifests.map((s) => s.id);

  const runtimeContext = {
    threadId: persistedThread.id,
    threadKey,
    workspaceId: persistedThread.workspaceId,
    workspaceKey,
    workspaceDir,
  };

  await ensureWorkspaceDirectory(runtimeContext.workspaceDir);

  const toolInvocationStates: Record<string, ToolInvocationViewState> = {};
  const [mcpRuntime, skillRuntime] = await Promise.all([
    buildMcpRuntime({
      workspaceId: runtimeContext.workspaceId,
      workspaceKey: runtimeContext.workspaceKey,
      workspaceDir: runtimeContext.workspaceDir,
      threadId: runtimeContext.threadId,
      threadKey: runtimeContext.threadKey,
    }),
    buildSkillRuntime(allSkillIds),
  ]);
  const workspaceTools = buildWorkspaceTools(runtimeContext, mcpRuntime);
  const docxTools = buildDocxTools(runtimeContext);
  const allTools = {
    ...workspaceTools,
    ...docxTools,
    ...mcpRuntime.tools,
  };
  // Match skills against user's latest message — agent-native: decide
  // which skills are relevant BEFORE generating, show "loaded skill X" immediately
  const lastUserMessage = uiMessages
    .filter((m) => m.role === "user")
    .pop();
  const lastUserText = lastUserMessage?.parts
    ?.filter((p): p is { type: "text"; text: string } => (p as { type: string }).type === "text")
    .map((p) => p.text)
    .join(" ") ?? "";
  const matchedSkills = matchSkillsForMessage(
    lastUserText,
    skillRuntime.skills.map((s) => s.manifest),
  );
  const docxClarificationState = getDocxClarificationState(uiMessages);
  const docxClarificationHint = buildDocxClarificationHint(docxClarificationState);

  const metadata = buildMetadataHandler({
    runtimeContext,
    mcpServers: mcpRuntime.servers,
    providerInfo,
    toolInvocationStates,
    matchedSkills,
  });

  let result;
  try {
    result = streamText({
      model: reqAgentModel,
      system:
        `${SYSTEM_PROMPT}\n\n` +
        `当前会话 thread_id: ${runtimeContext.threadId}\n` +
        `当前会话 thread_key: ${runtimeContext.threadKey}\n` +
        `当前工作区目录: ${runtimeContext.workspaceDir}\n` +
        `${mcpRuntime.promptSection}\n` +
        `${skillRuntime.promptSection}\n` +
        "需求文档默认写入 docs/requirements.md。\n" +
        "不要使用 bash 创建、覆盖或移动文档文件；文件读写一律使用 readFile / writeFile 或已接入的文件系统工具。\n" +
        "导出 DOCX 时，优先调用 writeFile 把正文写入 docs/requirements.md，再调用 export_docx({ sourcePath, filename, ... })。避免把整篇正文直接塞进 export_docx 参数。\n" +
        "如果当前任务是生成需求文档，Markdown 需要贴合银行式需求说明书的风格和章节族：概述、业务概述、功能描述、数据要求、非功能及系统级需求，并尽量包含项目参与部门职责表、输入要素表、输出要素表。\n" +
        "章节名、层级和编号都可以按业务复杂度扩展；模板中的 3.2.1 之类写法只用于示例，不是强约束。优先保证语义完整、表格语义正确、章节可扩展。\n" +
        "不要默认输出通用产品 PRD 风格的 FR-001 / 用户故事 / 验收标准结构，除非用户明确要求。\n" +
        "写功能章节时，优先按“功能项/能力项”组织，每个 major capability 单独成段；如涉及字段交互，尽量给出输入要素表和输出要素表。\n" +
        "所有文件操作都以当前项目工作区为根目录，路径统一使用相对路径。\n" +
        `${docxClarificationHint}`,
      messages: await convertToModelMessages(uiMessages),
      tools: allTools,
      stopWhen: stepCountIs(8),
      experimental_repairToolCall: async ({ toolCall, inputSchema, messages }) => {
        console.log(`[ReqAgent repair] tool=${toolCall.toolName} input=${toolCall.input?.slice(0, 80)}`);
        const schema = await inputSchema({ toolName: toolCall.toolName });
        const { text } = await generateText({
          model: reqAgentModel,
          system: "You repair a malformed or truncated tool call JSON. Return ONLY valid JSON that matches the schema. No explanation.",
          prompt: `Tool: ${toolCall.toolName}\nSchema: ${JSON.stringify(schema)}\nMalformed input: ${toolCall.input}\nUser message context: ${JSON.stringify(messages.slice(-2))}\n\nReturn valid JSON only:`,
        });
        try {
          JSON.parse(text.trim());
          return { ...toolCall, input: text.trim() };
        } catch {
          return null;
        }
      },
      providerOptions: {
        openai: { store: providerInfo.wireApi === "responses" ? true : undefined },
      },
      onFinish: async () => {
        await mcpRuntime.cleanup();
      },
      onStepFinish: ({ toolCalls, toolResults, text, finishReason }) => {
        metadata.recordStep({
          finishReason,
          text,
          toolCalls: toolCalls.map((toolCall) => ({
            toolName: toolCall.toolName,
            input: toolCall.input,
          })),
          toolResults: toolResults.map((toolResult) => {
            const candidate = toolResult as Record<string, unknown>;
            return {
              toolName: candidate.toolName,
              output: candidate.output,
              result: candidate.result,
            };
          }),
        });

        if (toolCalls.length > 0) {
          console.log(
            "[ReqAgent step] tools:",
            toolCalls.map((toolCall) => `${toolCall.toolName}(${JSON.stringify(toolCall.input).slice(0, 120)})`),
          );
        }
        if (text) {
          console.log(`[ReqAgent step] text: ${text.slice(0, 80)}...`);
        }
        console.log(`[ReqAgent step] finish: ${finishReason}, toolResults: ${toolResults.length}`);
      },
    });
  } catch (error) {
    await mcpRuntime.cleanup();
    throw error;
  }

  return result.toUIMessageStreamResponse({
    originalMessages: uiMessages,
    onFinish: async ({ messages: finalMessages }) => {
      syncThreadUiMessages(runtimeContext.threadId, finalMessages);
    },
    sendReasoning: true,
    messageMetadata: metadata.messageMetadata,
  });
}
