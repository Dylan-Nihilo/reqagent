import type { RuntimeContext } from "@/lib/workspace/context";

export type ReqAgentPromptBlock = {
  key: string;
  content: string;
  dynamic: boolean;
};

type ExecutionContextParams = {
  runtimeContext: RuntimeContext;
  threadSummaryText?: string;
  workspaceSummaryText?: string;
};

type SystemBlockParams = {
  executionContext: ReturnType<typeof buildExecutionContext>;
  capabilityBlocks: ReqAgentPromptBlock[];
  docxClarificationHint?: string;
};

const IDENTITY_BLOCK = [
  "你是 ReqAgent，一个 AI 助手。用中文回复，代码和路径保持英文。",
  "如果用户只是打招呼、闲聊、问一般知识性问题，直接用文字回复，不要调用工具。",
].join("\n");

const TOOL_POLICY_BLOCK = [
  "工具原则：",
  "1. 只在用户明确要求操作文件、搜索内容、执行命令或访问外部资源时才使用工具。",
  "2. 需要了解项目时，先 list_files，再针对性 readFile。",
  "3. 搜索内容优先 search_workspace，只有结构化工具不够用时才考虑 bash。",
  "4. 文件读写一律使用 readFile / writeFile 或已接入的文件系统工具。",
  "5. 外部系统优先使用对应的 MCP 工具，不要用 bash 伪造远程调用。",
].join("\n");

const WRITING_RULES_BLOCK = [
  "写作与执行规则：",
  "- 所有文件操作都以当前项目工作区为根目录，路径统一使用相对路径。",
  "- 不要默认输出通用产品 PRD 风格的 FR-001 / 用户故事 / 验收标准结构，除非用户明确要求。",
  "- 写功能章节时，优先按“功能项/能力项”组织，每个 major capability 单独成段；如涉及字段交互，尽量给出输入要素表和输出要素表。",
].join("\n");

const DOCX_POLICY_BLOCK = [
  "DOCX / 长文档规则：",
  "- 需求文档默认写入 docs/requirements.md。",
  "- 不要使用 bash 创建、覆盖或移动文档文件；文件读写一律使用 readFile / writeFile 或已接入的文件系统工具。",
  "- 导出 DOCX 时，优先调用 writeFile 把正文写入 docs/requirements.md，再调用 export_docx({ sourcePath, filename, ... })。避免把整篇正文直接塞进 export_docx 参数。",
  "- 如果当前任务是生成需求文档，Markdown 需要贴合银行式需求说明书的风格和章节族：概述、业务概述、功能描述、数据要求、非功能及系统级需求，并尽量包含项目参与部门职责表、输入要素表、输出要素表。",
  "- 章节名、层级和编号都可以按业务复杂度扩展；模板中的 3.2.1 之类写法只用于示例，不是强约束。优先保证语义完整、表格语义正确、章节可扩展。",
  "- 生成长文档时（预计超过 3000 字），使用增量模式：init_document → fill_section → get_document_status → finalize_document。",
  "- 短文档可继续使用 writeFile + export_docx 的直接模式。",
].join("\n");

function createBlock(key: string, content: string, dynamic: boolean): ReqAgentPromptBlock | null {
  const normalized = content.trim();
  if (!normalized) return null;
  return { key, content: normalized, dynamic };
}

export function serializePromptBlocks(blocks: ReqAgentPromptBlock[]) {
  return blocks.map((block) => block.content.trim()).filter(Boolean).join("\n\n");
}

export function buildExecutionContext({
  runtimeContext,
  threadSummaryText,
  workspaceSummaryText,
}: ExecutionContextParams) {
  return {
    runtimeContextBlock: createBlock(
      "runtime-context",
      [
        `当前会话 thread_id: ${runtimeContext.threadId}`,
        `当前会话 thread_key: ${runtimeContext.threadKey}`,
        `当前工作区 workspace_id: ${runtimeContext.workspaceId}`,
        `当前工作区 workspace_key: ${runtimeContext.workspaceKey}`,
      ].join("\n"),
      true,
    )!,
    threadSummaryBlock: createBlock(
      "thread-summary",
      `线程摘要：\n${threadSummaryText ?? ""}`,
      true,
    ),
    workspaceSummaryBlock: createBlock(
      "workspace-summary",
      `工作区摘要：\n${workspaceSummaryText ?? ""}`,
      true,
    ),
  };
}

export function buildSystemBlocks({
  executionContext,
  capabilityBlocks,
  docxClarificationHint,
}: SystemBlockParams): ReqAgentPromptBlock[] {
  const blocks = [
    createBlock("identity", IDENTITY_BLOCK, false),
    createBlock("tool-policy", TOOL_POLICY_BLOCK, false),
    createBlock("writing-rules", WRITING_RULES_BLOCK, false),
    createBlock(
      "docx-policy",
      [DOCX_POLICY_BLOCK, docxClarificationHint?.trim()].filter(Boolean).join("\n"),
      Boolean(docxClarificationHint?.trim()),
    ),
    executionContext.runtimeContextBlock,
    capabilityBlocks.find((block) => block.key === "matched-skills") ?? null,
    capabilityBlocks.find((block) => block.key === "mcp-summary") ?? null,
    executionContext.threadSummaryBlock ?? null,
    executionContext.workspaceSummaryBlock ?? null,
  ];

  return blocks.filter((block): block is ReqAgentPromptBlock => Boolean(block));
}
