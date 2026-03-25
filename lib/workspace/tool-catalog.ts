export type ToolCategory = "workspace" | "shell" | "meta" | "mcp";

export type MountedToolInfo = {
  name: string;
  category: ToolCategory;
  description: string;
};

export const TOOL_DESCRIPTIONS = {
  fetch_url:
    "Fetch the content of a URL and return it as clean Markdown. Use this to read web pages, documentation, PRDs, or competitor sites shared by the user.",
  list_files:
    "List files in the workspace directory tree with metadata (type, size, mtime). Supports depth, sorting, hidden-file control, and summary stats.",
  search_workspace:
    "Full-text search across workspace files. Supports literal or regex matching, glob filtering, surrounding context, and relevance-ranked results.",
  readFile:
    "Read file contents from the workspace. Supports line-based pagination for text and base64 output for binary files.",
  writeFile:
    "Write content to a file in the workspace. Supports overwrite, append, and patch modes. Patch mode can replace one or all matches.",
  bash:
    "Execute a shell command in the workspace directory. Has full access to system commands (python3, node, git, curl, etc).",
  list_available_tools:
    "Return the list of currently available tools with category and description. Call when the user asks what you can do.",
} as const;

export function categorizeTool(name: string): ToolCategory {
  if (["list_files", "search_workspace", "readFile", "writeFile", "fetch_url"].includes(name)) {
    return "workspace";
  }
  if (name === "bash") return "shell";
  if (name === "list_available_tools") return "meta";
  return "mcp";
}

export function getToolDescription(name: string, tools: Record<string, unknown>) {
  if (name in TOOL_DESCRIPTIONS) {
    return TOOL_DESCRIPTIONS[name as keyof typeof TOOL_DESCRIPTIONS];
  }

  const candidate = tools[name] as
    | { description?: unknown; tool?: { description?: unknown } }
    | undefined;

  if (typeof candidate?.description === "string" && candidate.description.trim()) {
    return candidate.description;
  }

  if (typeof candidate?.tool?.description === "string" && candidate.tool.description.trim()) {
    return candidate.tool.description;
  }

  return "External MCP tool";
}
