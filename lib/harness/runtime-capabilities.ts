import type { UIMessage } from "ai";
import { getAvailableToolsResult } from "@/lib/tool-registry";
import { buildMcpRuntime } from "@/lib/mcp";
import { readProjectConfig } from "@/lib/project-config";
import { buildSkillRuntime, listSkills } from "@/lib/skills/loader";
import { matchSkillsForMessage } from "@/lib/skills/matcher";
import type { ReqAgentLoadedSkillMeta } from "@/lib/skills/types";
import { buildDocxTools } from "@/lib/workspace/docx-tools";
import type { RuntimeContext } from "@/lib/workspace/context";
import { buildWorkspaceTools } from "@/lib/workspace/workspace-tools";
import type { ReqAgentPromptBlock } from "@/lib/harness/prompt-blocks";
import type { ReqAgentCapabilitySnapshotMeta } from "@/lib/types";

function extractLastUserText(uiMessages: ReadonlyArray<UIMessage>) {
  const lastUserMessage = [...uiMessages].reverse().find((message) => message.role === "user");
  return lastUserMessage?.parts
    ?.filter((part): part is { type: "text"; text: string } => (part as { type?: string }).type === "text")
    .map((part) => part.text)
    .join(" ")
    .trim() ?? "";
}

function buildSkillPromptBlock(matchedSkills: ReqAgentLoadedSkillMeta[], promptSection: string): ReqAgentPromptBlock | null {
  if (matchedSkills.length === 0 || !promptSection.trim()) return null;
  return {
    key: "matched-skills",
    dynamic: true,
    content: promptSection.trim(),
  };
}

function buildMcpPromptBlock(promptSection: string): ReqAgentPromptBlock | null {
  if (!promptSection.trim()) return null;
  return {
    key: "mcp-summary",
    dynamic: true,
    content: promptSection.trim(),
  };
}

export async function buildRuntimeCapabilities({
  runtimeContext,
  uiMessages,
}: {
  runtimeContext: RuntimeContext;
  uiMessages: ReadonlyArray<UIMessage>;
}) {
  const [projectConfig, allSkillManifests] = await Promise.all([
    readProjectConfig(),
    listSkills(),
  ]);
  const enabledSkillIds = new Set(projectConfig.enabledSkillIds);
  const enabledSkillManifests = allSkillManifests.filter((skill) => enabledSkillIds.has(skill.id));
  const lastUserText = extractLastUserText(uiMessages);
  const matchedSkills = matchSkillsForMessage(lastUserText, enabledSkillManifests);
  const matchedSkillIds = matchedSkills.map((skill) => skill.id);

  const [mcpRuntime, skillRuntime] = await Promise.all([
    buildMcpRuntime({
      workspaceId: runtimeContext.workspaceId,
      workspaceKey: runtimeContext.workspaceKey,
      workspaceDir: runtimeContext.workspaceDir,
      threadId: runtimeContext.threadId,
      threadKey: runtimeContext.threadKey,
    }),
    buildSkillRuntime(matchedSkillIds),
  ]);

  const workspaceTools = buildWorkspaceTools(runtimeContext, mcpRuntime);
  const docxTools = buildDocxTools(runtimeContext);
  const allTools = {
    ...workspaceTools,
    ...docxTools,
    ...mcpRuntime.tools,
  };
  const toolCatalog = getAvailableToolsResult(mcpRuntime.registryItems);

  const promptBlocks = [
    buildSkillPromptBlock(matchedSkills, skillRuntime.promptSection),
    buildMcpPromptBlock(mcpRuntime.promptSection),
  ].filter((block): block is ReqAgentPromptBlock => Boolean(block));

  const capabilitySnapshot: ReqAgentCapabilitySnapshotMeta = {
    matchedSkills: matchedSkills.length > 0 ? matchedSkills : undefined,
    mountedToolNames: Object.keys(allTools),
    toolCatalog: {
      total: toolCatalog.total,
      summary: toolCatalog.summary,
    },
    mcpServers: mcpRuntime.servers.map((server) => ({
      id: server.id,
      label: server.label,
      state: server.state,
      toolCount: server.toolCount,
    })),
  };

  return {
    allTools,
    capabilitySnapshot,
    matchedSkills,
    mcpRuntime,
    promptBlocks,
    skillRuntime,
    toolCatalog,
  };
}
