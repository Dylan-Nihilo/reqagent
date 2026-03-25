import path from "node:path";
import { promises as fs } from "node:fs";
import { z } from "zod";
import { createMCPClient, type ListToolsResult, type MCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { reqAgentProvider, supportsNativeResponsesMcp } from "@/lib/ai-provider";
import type { McpToolRegistryMeta, ToolRegistryItem } from "@/lib/tool-registry";

const DEFAULT_MCP_CONFIG_PATHS = [
  path.join(process.cwd(), "reqagent.mcp.json"),
  path.join(process.cwd(), ".reqagent", "mcp.json"),
];

const executionModeSchema = z.enum(["proxy", "auto"]);

const remoteTransportSchema = z.object({
  type: z.enum(["http", "sse"]),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  redirect: z.enum(["follow", "error"]).optional(),
});

const stdioTransportSchema = z.object({
  type: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  stderr: z.enum(["pipe", "inherit", "ignore"]).optional(),
});

const mcpServerSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  executionMode: executionModeSchema.optional(),
  includeTools: z.array(z.string()).optional(),
  excludeTools: z.array(z.string()).optional(),
  toolPrefix: z.string().optional(),
  transport: z.union([remoteTransportSchema, stdioTransportSchema]),
});

const mcpConfigFileSchema = z.union([
  z.array(mcpServerSchema),
  z.object({
    servers: z.array(mcpServerSchema),
  }),
]);

type McpServerConfig = z.infer<typeof mcpServerSchema>;
type McpConfigFile = z.infer<typeof mcpConfigFileSchema>;

export type ReqAgentMcpRuntimeContext = {
  workspaceId?: string;
  workspaceKey?: string;
  workspaceDir?: string;
  threadId?: string;
  threadKey?: string;
};

export type ReqAgentMcpServerStatus = {
  id: string;
  label: string;
  transport: "http" | "sse" | "stdio";
  mode: "proxy" | "native";
  state: "ready" | "disabled" | "failed";
  toolCount: number;
  toolNames: string[];
  error?: string;
  source?: string;
};

type ReqAgentRuntimeToolSet = Record<string, unknown>;

export type ReqAgentMcpRuntime = {
  tools: ReqAgentRuntimeToolSet;
  registryItems: ToolRegistryItem[];
  servers: ReqAgentMcpServerStatus[];
  promptSection: string;
  cleanup: () => Promise<void>;
};

function readEnv(name: string) {
  const value = process.env[name];
  return value?.trim() ? value.trim() : undefined;
}

function interpolateEnv(value: unknown, runtimeValues: Record<string, string | undefined> = {}): unknown {
  if (typeof value === "string") {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name: string) => runtimeValues[name] ?? process.env[name] ?? "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateEnv(item, runtimeValues));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, interpolateEnv(nestedValue, runtimeValues)]),
    );
  }

  return value;
}

function buildRuntimeInterpolationValues(context: ReqAgentMcpRuntimeContext) {
  return {
    REQAGENT_WORKSPACE_ID: context.workspaceId,
    REQAGENT_WORKSPACE_KEY: context.workspaceKey,
    REQAGENT_WORKSPACE_DIR: context.workspaceDir,
    REQAGENT_THREAD_ID: context.threadId,
    REQAGENT_THREAD_KEY: context.threadKey,
  };
}

function normalizeConfig(candidate: McpConfigFile): McpServerConfig[] {
  return Array.isArray(candidate) ? candidate : candidate.servers;
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readConfigFromFile(targetPath: string, runtimeValues: Record<string, string | undefined>) {
  const content = await fs.readFile(targetPath, "utf8");
  const raw = JSON.parse(content) as unknown;
  const parsed = mcpConfigFileSchema.parse(interpolateEnv(raw, runtimeValues));

  return {
    servers: normalizeConfig(parsed),
    source: path.relative(process.cwd(), targetPath) || targetPath,
  };
}

async function loadMcpConfig(runtimeValues: Record<string, string | undefined>): Promise<{ servers: McpServerConfig[]; source?: string }> {
  const inlineServers = readEnv("REQAGENT_MCP_SERVERS");
  if (inlineServers) {
    const raw = JSON.parse(inlineServers) as unknown;
    const parsed = mcpConfigFileSchema.parse(interpolateEnv(raw, runtimeValues));
    return {
      servers: normalizeConfig(parsed),
      source: "REQAGENT_MCP_SERVERS",
    };
  }

  const configuredPath = readEnv("REQAGENT_MCP_CONFIG");
  const candidatePaths = configuredPath
    ? [path.resolve(process.cwd(), configuredPath)]
    : DEFAULT_MCP_CONFIG_PATHS;

  for (const candidatePath of candidatePaths) {
    if (!(await fileExists(candidatePath))) {
      continue;
    }

    return readConfigFromFile(candidatePath, runtimeValues);
  }

  return { servers: [] };
}

function sanitizeSegment(value: string) {
  // OpenAI function names must match ^[a-zA-Z0-9_-]+$ — dots are NOT allowed
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "server";
}

function getToolPrefix(server: McpServerConfig) {
  const configuredPrefix = server.toolPrefix?.trim();
  if (configuredPrefix) {
    // Replace dots with underscores for OpenAI compatibility
    return sanitizeSegment(configuredPrefix) || `mcp_${sanitizeSegment(server.id)}`;
  }

  return `mcp_${sanitizeSegment(server.id)}`;
}

function getExecutionMode(server: McpServerConfig): "proxy" | "native" {
  const configuredMode = server.executionMode ?? executionModeSchema.catch("proxy").parse(readEnv("REQAGENT_MCP_EXECUTION_MODE"));
  const nativeEligible = supportsNativeResponsesMcp() && server.transport.type === "http";

  if (configuredMode === "auto" && nativeEligible) {
    return "native";
  }

  return "proxy";
}

function trimToolDefinitions(definitions: ListToolsResult, maxDescLen = 120): ListToolsResult {
  return {
    ...definitions,
    tools: definitions.tools.map((t) => ({
      ...t,
      description: t.description && t.description.length > maxDescLen
        ? t.description.slice(0, maxDescLen) + "…"
        : t.description,
    })),
  };
}

function filterToolDefinitions(definitions: ListToolsResult, server: McpServerConfig) {
  const includeTools = new Set(server.includeTools ?? []);
  const excludeTools = new Set(server.excludeTools ?? []);

  const tools = definitions.tools.filter((tool) => {
    if (includeTools.size > 0 && !includeTools.has(tool.name)) {
      return false;
    }

    return !excludeTools.has(tool.name);
  });

  return {
    ...definitions,
    tools,
  };
}

async function listAllTools(client: MCPClient): Promise<ListToolsResult> {
  const tools: ListToolsResult["tools"] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listTools({
      params: cursor ? { cursor } : undefined,
    });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor);

  return {
    tools,
  };
}

function validateStdioArgs(server: McpServerConfig) {
  if (server.transport.type !== "stdio") return;
  const args = server.transport.args ?? [];
  const emptyArg = args.find((a) => a.trim() === "");
  if (emptyArg !== undefined) {
    throw new Error(
      `MCP server "${server.id}" has an empty arg after interpolation — ` +
        `check that all \$\{VAR\} placeholders are resolved (got: ${JSON.stringify(args)})`,
    );
  }
}

function buildClientTransport(server: McpServerConfig) {
  if (server.transport.type === "stdio") {
    return new Experimental_StdioMCPTransport({
      command: server.transport.command,
      args: server.transport.args,
      cwd: server.transport.cwd,
      env: server.transport.env,
      stderr: server.transport.stderr,
    });
  }

  return {
    type: server.transport.type,
    url: server.transport.url,
    headers: server.transport.headers,
    redirect: server.transport.redirect,
  } as const;
}

function buildRegistryItem(input: {
  name: string;
  title: string;
  description: string;
  usageHint: string;
  preferredOrder: number;
  mcp: McpToolRegistryMeta;
}): ToolRegistryItem {
  return {
    name: input.name,
    title: input.title,
    category: "mcp",
    description: input.description,
    usageHint: input.usageHint,
    riskLevel: "caution",
    preferredOrder: input.preferredOrder,
    supportsApproval: false,
    rendererKind: "mcp",
    mcp: input.mcp,
  };
}

function summarizeRemoteTools(toolNames: string[]) {
  if (toolNames.length === 0) return "未发现可调用工具";
  if (toolNames.length <= 4) return toolNames.join(", ");
  return `${toolNames.slice(0, 4).join(", ")} 等 ${toolNames.length} 个`;
}

function buildPromptSection(servers: ReqAgentMcpServerStatus[]) {
  const readyServers = servers.filter((server) => server.state === "ready" && server.toolCount > 0);
  if (readyServers.length === 0) {
    return "当前没有可用的 MCP 工具。";
  }

  return [
    "动态 MCP 工具（外部服务）:",
    ...readyServers.map((server) => `- ${server.label}: ${summarizeRemoteTools(server.toolNames)}`),
    "当任务涉及第三方系统、远程知识库、浏览器自动化或外部 API 时，优先使用对应的 MCP 工具，不要用 bash 伪造远程调用。",
  ].join("\n");
}

export async function buildMcpRuntime(context: ReqAgentMcpRuntimeContext = {}): Promise<ReqAgentMcpRuntime> {
  const tools: ReqAgentRuntimeToolSet = {};
  const registryItems: ToolRegistryItem[] = [];
  const servers: ReqAgentMcpServerStatus[] = [];
  const cleanupTasks: Array<() => Promise<void>> = [];
  const runtimeValues = buildRuntimeInterpolationValues(context);

  let configuredServers: McpServerConfig[];
  let configSource: string | undefined;

  try {
    const loaded = await loadMcpConfig(runtimeValues);
    configuredServers = loaded.servers;
    configSource = loaded.source;
  } catch (error) {
    return {
      tools,
      registryItems,
      servers: [
        {
          id: "config",
          label: "MCP config",
          transport: "http",
          mode: "proxy",
          state: "failed",
          toolCount: 0,
          toolNames: [],
          error: error instanceof Error ? error.message : "Failed to load MCP config",
        },
      ],
      promptSection: "MCP 配置读取失败，当前不使用 MCP 工具。",
      cleanup: async () => {},
    };
  }

  for (const server of configuredServers) {
    const label = server.label?.trim() || server.id;
    const statusBase = {
      id: server.id,
      label,
      transport: server.transport.type,
      mode: getExecutionMode(server),
      toolCount: 0,
      toolNames: [] as string[],
      source: configSource,
    };

    if (server.enabled === false) {
      servers.push({
        ...statusBase,
        state: "disabled",
      });
      continue;
    }

    let client: MCPClient | null = null;

    try {
      validateStdioArgs(server);
      const transport = buildClientTransport(server);
      client = await Promise.race([
        createMCPClient({ transport }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`MCP server "${server.id}" connect timeout (8s)`)), 8_000),
        ),
      ]);

      const definitions = filterToolDefinitions(await listAllTools(client), server);
      const toolNames = definitions.tools.map((tool) => tool.name);
      const usageHint = `${label} · ${server.transport.type} · ${summarizeRemoteTools(toolNames)}`;

      if (statusBase.mode === "native" && server.transport.type === "http") {
        const toolName = getToolPrefix(server);
        tools[toolName] = reqAgentProvider.tools.mcp({
          serverLabel: label,
          serverUrl: server.transport.url,
          serverDescription: server.description,
          headers: server.transport.headers,
          allowedTools: toolNames.length > 0 ? toolNames : undefined,
        });

        registryItems.push(
          buildRegistryItem({
            name: toolName,
            title: `${label} MCP`,
            description: server.description ?? `调用 ${label} 暴露的远程工具。`,
            usageHint,
            preferredOrder: 500 + registryItems.length,
            mcp: {
              serverId: server.id,
              serverLabel: label,
              transport: server.transport.type,
              mode: statusBase.mode,
            },
          }),
        );

        servers.push({
          ...statusBase,
          state: "ready",
          toolCount: toolNames.length,
          toolNames,
        });

        await client.close();
        continue;
      }

      const trimmedDefinitions = trimToolDefinitions(definitions);
      const proxiedTools = client.toolsFromDefinitions(trimmedDefinitions);
      const prefix = getToolPrefix(server);
      const registeredToolNames: string[] = [];

      for (const definition of definitions.tools) {
        const proxiedTool = proxiedTools[definition.name];
        if (!proxiedTool) continue;

        const toolName = `${prefix}_${sanitizeSegment(definition.name)}`;
        tools[toolName] = proxiedTool;
        registeredToolNames.push(toolName);
        registryItems.push(
          buildRegistryItem({
            name: toolName,
            title: definition.title ?? definition.annotations?.title ?? definition.name,
            description: definition.description ?? server.description ?? `${label} 暴露的 MCP 工具。`,
            usageHint,
            preferredOrder: 500 + registryItems.length,
            mcp: {
              serverId: server.id,
              serverLabel: label,
              transport: server.transport.type,
              mode: statusBase.mode,
              sourceToolName: definition.name,
            },
          }),
        );
      }

      cleanupTasks.push(async () => {
        await client?.close();
      });

      servers.push({
        ...statusBase,
        state: "ready",
        toolCount: registeredToolNames.length,
        toolNames: registeredToolNames,
      });
    } catch (error) {
      if (client) {
        await client.close().catch(() => undefined);
      }

      servers.push({
        ...statusBase,
        state: "failed",
        error: error instanceof Error ? error.message : "Failed to connect MCP server",
      });
    }
  }

  return {
    tools,
    registryItems,
    servers,
    promptSection: buildPromptSection(servers),
    cleanup: async () => {
      await Promise.allSettled(cleanupTasks.map((task) => task()));
    },
  };
}
