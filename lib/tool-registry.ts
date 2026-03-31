export type ToolCategory = "structured" | "workspace" | "execution" | "interaction" | "mcp";
export type ToolRiskLevel = "safe" | "caution" | "sensitive";
export type ToolRendererKind = "structured" | "terminal" | "catalog" | "mcp";

export type McpToolRegistryMeta = {
  serverId: string;
  serverLabel: string;
  transport: "http" | "sse" | "stdio";
  mode: "proxy" | "native";
  sourceToolName?: string;
};

export type ToolRegistryItem = {
  name: string;
  title: string;
  category: ToolCategory;
  source: string;
  description: string;
  usageHint: string;
  riskLevel: ToolRiskLevel;
  preferredOrder: number;
  supportsApproval: boolean;
  rendererKind: ToolRendererKind;
  promptExposure: "always" | "on-demand";
  mcp?: McpToolRegistryMeta;
};

export type AvailableToolDescriptor = {
  name: string;
  title: string;
  source: string;
  description: string;
  usageHint: string;
  riskLevel: ToolRiskLevel;
  preferredToBash: boolean;
  supportsApproval: boolean;
  promptExposure: ToolRegistryItem["promptExposure"];
  mounted: boolean;
};

export type AvailableToolGroup = {
  key: ToolCategory;
  title: string;
  tools: AvailableToolDescriptor[];
};

export type AvailableToolsResult = {
  total: number;
  groups: AvailableToolGroup[];
  summary: string;
};

export const toolCategoryLabels: Record<ToolCategory, string> = {
  structured: "结构化工具",
  workspace: "工作区工具",
  execution: "执行工具",
  interaction: "交互 / 审批",
  mcp: "MCP 外部工具",
};

export const toolRiskLabels: Record<ToolRiskLevel, string> = {
  safe: "低风险",
  caution: "需谨慎",
  sensitive: "高影响",
};

export const toolRegistry: ToolRegistryItem[] = [
  {
    name: "search_knowledge",
    title: "知识检索",
    category: "structured",
    source: "builtin",
    description: "搜索领域模式和最佳实践，为需求拆解提供参考。",
    usageHint: "用户在描述产品需求、领域规则或行业流程时优先使用。",
    riskLevel: "safe",
    preferredOrder: 10,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "on-demand",
  },
  {
    name: "list_files",
    title: "文件列表",
    category: "workspace",
    source: "builtin",
    description: "查看工作区目录结构，快速判断项目布局。",
    usageHint: "第一次进入工作区或需要确认目录边界时优先使用。",
    riskLevel: "safe",
    preferredOrder: 20,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "search_workspace",
    title: "工作区搜索",
    category: "workspace",
    source: "builtin",
    description: "在工作区里搜索代码、配置和文档文本。",
    usageHint: "找函数、配置项、错误信息时优先于 bash grep。",
    riskLevel: "safe",
    preferredOrder: 30,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "readFile",
    title: "读取文件",
    category: "workspace",
    source: "builtin",
    description: "读取指定文件的完整内容。",
    usageHint: "已经定位到具体文件后使用，避免先上 bash cat。",
    riskLevel: "safe",
    preferredOrder: 40,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "fetch_url",
    title: "网页抓取",
    category: "workspace",
    source: "builtin",
    description: "抓取网页并转成适合阅读的 Markdown 文本。",
    usageHint: "用户贴了 URL、文档页或竞品页面时优先使用，而不是手写 curl。",
    riskLevel: "safe",
    preferredOrder: 45,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "writeFile",
    title: "写入文件",
    category: "execution",
    source: "builtin",
    description: "创建或更新工作区文件内容。",
    usageHint: "需要生成文档或修改工作区文件时使用。",
    riskLevel: "sensitive",
    preferredOrder: 50,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "parse_docx",
    title: "解析 DOCX",
    category: "workspace",
    source: "builtin",
    description: "解析 DOCX 模板的章节、表格、样式和目录结构。",
    usageHint: "用户提供业务需求说明书模板或参考文档时优先使用。",
    riskLevel: "safe",
    preferredOrder: 52,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "export_docx",
    title: "导出 DOCX",
    category: "execution",
    source: "builtin",
    description: "把 Markdown 草稿导出为带封面、修订记录和目录页的 DOCX 文档。",
    usageHint: "先 writeFile 到 docs/requirements.md，再通过 sourcePath 导出。",
    riskLevel: "sensitive",
    preferredOrder: 54,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "init_document",
    title: "初始化文档",
    category: "structured",
    source: "builtin",
    description: "创建持久化的章节累加文档会话，并返回模板大纲与目标字数。",
    usageHint: "预计文档较长时先调用，再按章节逐步填充。",
    riskLevel: "safe",
    preferredOrder: 55,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "fill_section",
    title: "填充章节",
    category: "execution",
    source: "builtin",
    description: "向文档会话写入或覆盖单个章节，也支持功能块、术语表和部门职责表。",
    usageHint: "长文档生成时按 section_id 分批调用，避免一次输出整篇。",
    riskLevel: "sensitive",
    preferredOrder: 56,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "get_document_status",
    title: "文档进度",
    category: "structured",
    source: "builtin",
    description: "读取当前文档会话的章节完成度、待填项和总字数进展。",
    usageHint: "每填完 1-2 个章节后调用，用于决定下一步补哪些部分。",
    riskLevel: "safe",
    preferredOrder: 57,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "finalize_document",
    title: "定稿导出",
    category: "execution",
    source: "builtin",
    description: "把已累积的章节组装成完整 Markdown，并走模板填充链路导出最终 DOCX。",
    usageHint: "确认必填章节都已完成后再调用，未完成时会直接失败。",
    riskLevel: "sensitive",
    preferredOrder: 58,
    supportsApproval: false,
    rendererKind: "structured",
    promptExposure: "always",
  },
  {
    name: "bash",
    title: "Shell 执行",
    category: "execution",
    source: "builtin",
    description: "执行 shell 命令并返回 stdout / stderr。",
    usageHint: "只有结构化工具不够用时再使用。",
    riskLevel: "sensitive",
    preferredOrder: 60,
    // Mirrors runtime auto-approve for the real DOCX agent flow.
    supportsApproval: false,
    rendererKind: "terminal",
    promptExposure: "on-demand",
  },
  {
    name: "list_available_tools",
    title: "工具目录",
    category: "interaction",
    source: "builtin",
    description: "结构化返回当前可用工具清单和推荐使用顺序。",
    usageHint: "当用户询问“你有哪些工具”时使用，而不是自由文本列举。",
    riskLevel: "safe",
    preferredOrder: 70,
    supportsApproval: false,
    rendererKind: "catalog",
    promptExposure: "on-demand",
  },
];

const toolRegistryByName = new Map(toolRegistry.map((tool) => [tool.name, tool] as const));

export function getToolRegistryItem(toolName: string): ToolRegistryItem | undefined {
  return toolRegistryByName.get(toolName);
}

export function buildAvailableToolsResult(items: ToolRegistryItem[]): AvailableToolsResult {
  const allItems = Array.from(
    new Map(items.map((tool) => [tool.name, tool] as const)).values(),
  );
  const mountedToolNames = new Set(allItems.map((tool) => tool.name));
  const groups = allItems
    .sort((left, right) => left.preferredOrder - right.preferredOrder)
    .reduce<Record<ToolCategory, AvailableToolDescriptor[]>>(
      (accumulator, tool) => {
        accumulator[tool.category].push({
          name: tool.name,
          title: tool.title,
          source: tool.source,
          description: tool.description,
          usageHint: tool.usageHint,
          riskLevel: tool.riskLevel,
          preferredToBash: tool.name !== "bash",
          supportsApproval: tool.supportsApproval,
          promptExposure: tool.promptExposure,
          mounted: mountedToolNames.has(tool.name),
        });
        return accumulator;
      },
      {
        structured: [],
        workspace: [],
        execution: [],
        interaction: [],
        mcp: [],
      },
    );

  return {
    total: allItems.length,
    groups: (Object.keys(toolCategoryLabels) as ToolCategory[]).map((key) => ({
      key,
      title: toolCategoryLabels[key],
      tools: groups[key],
    })),
    summary: "已按类别整理当前工具，并标记推荐顺序与风险级别。",
  };
}

export function getAvailableToolsResult(extraItems: ToolRegistryItem[] = []): AvailableToolsResult {
  return buildAvailableToolsResult([...toolRegistry, ...extraItems]);
}
