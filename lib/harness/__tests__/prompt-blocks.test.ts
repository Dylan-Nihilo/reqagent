import { describe, expect, it } from "vitest";
import { buildExecutionContext, buildSystemBlocks, serializePromptBlocks } from "../prompt-blocks";
import type { RuntimeContext } from "@/lib/workspace/context";

const runtimeContext: RuntimeContext = {
  threadId: "thread-1",
  threadKey: "thread-key",
  workspaceId: "workspace-1",
  workspaceKey: "workspace-key",
  workspaceDir: "/tmp/reqagent-workspace",
};

describe("prompt-blocks", () => {
  it("builds prompt blocks in a stable order", () => {
    const executionContext = buildExecutionContext({
      runtimeContext,
      threadSummaryText: "- Goal: ship",
      workspaceSummaryText: "- Recent Artifacts: docs/requirements.md",
    });
    const blocks = buildSystemBlocks({
      executionContext,
      capabilityBlocks: [
        { key: "matched-skills", content: "## Skill: PRD", dynamic: true },
        { key: "mcp-summary", content: "MCP 服务器概况：\n- Browser [ready]", dynamic: true },
      ],
      docxClarificationHint: "当前任务和文档导出相关。",
    });

    expect(blocks.map((block) => block.key)).toEqual([
      "identity",
      "tool-policy",
      "writing-rules",
      "docx-policy",
      "runtime-context",
      "matched-skills",
      "mcp-summary",
      "thread-summary",
      "workspace-summary",
    ]);
  });

  it("serializes blocks without dropping content", () => {
    const executionContext = buildExecutionContext({ runtimeContext });
    const blocks = buildSystemBlocks({
      executionContext,
      capabilityBlocks: [],
      docxClarificationHint: "",
    });
    const serialized = serializePromptBlocks(blocks);

    expect(serialized).toContain("你是 ReqAgent");
    expect(serialized).toContain("当前工作区 workspace_id: workspace-1");
    expect(serialized).toContain("DOCX / 长文档规则");
  });
});
