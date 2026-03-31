import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return {
    ...actual,
    generateText: vi.fn(async () => ({
      text: JSON.stringify({
        goal: "整理需求并导出文档",
        decisions: ["先写 docs/requirements.md"],
        openQuestions: ["是否需要附录"],
        recentTools: ["writeFile"],
        artifactPaths: ["docs/requirements.md"],
      }),
    })),
  };
});

import { prepareThreadSummaryContext, mergeWorkspaceSummary } from "../thread-summary";

function asUiMessages(value: unknown): UIMessage[] {
  return value as UIMessage[];
}

describe("thread-summary", () => {
  it("does not compact short conversations", async () => {
    const messages = asUiMessages([
      { id: "1", role: "user", parts: [{ type: "text", text: "你好" }] },
      { id: "2", role: "assistant", parts: [{ type: "text", text: "你好，需要我做什么？" }] },
    ]);

    const result = await prepareThreadSummaryContext({
      model: {} as never,
      messages,
      currentSummary: null,
    });

    expect(result.modelMessages).toHaveLength(2);
    expect(result.nextSummary).toBeNull();
    expect(result.threadSummaryText).toBeUndefined();
  });

  it("compacts long conversations and keeps the recent window", async () => {
    const messages = asUiMessages(Array.from({ length: 26 }, (_, index) => ({
      id: String(index + 1),
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [
        {
          type: index % 5 === 0 ? "tool-call" : "text",
          ...(index % 5 === 0
            ? {
                toolName: "writeFile",
                result: {
                  reqagent: {
                    artifact: {
                      kind: "document",
                      label: "需求文档",
                      summary: "docs/requirements.md",
                      path: "docs/requirements.md",
                    },
                  },
                },
              }
            : { text: `message-${index}` }),
        },
      ],
    })));

    const result = await prepareThreadSummaryContext({
      model: {} as never,
      messages,
      currentSummary: null,
    });

    expect(result.modelMessages).toHaveLength(8);
    expect(result.nextSummary?.goal).toBe("整理需求并导出文档");
    expect(result.threadSummaryText).toContain("目标");
  });

  it("merges workspace artifacts from envelope results", () => {
    const currentSummary = {
      recentArtifacts: [{ path: "docs/old.md", label: "旧文档" }],
      trackedFiles: ["docs/old.md"],
      updatedAt: Date.now(),
    };
    const messages = asUiMessages([
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            result: {
              reqagent: {
                artifact: {
                  kind: "document",
                  label: "需求文档",
                  summary: "docs/requirements.md",
                  path: "docs/requirements.md",
                },
              },
            },
          },
        ],
      },
    ]);

    const merged = mergeWorkspaceSummary(currentSummary, messages);

    expect(merged?.recentArtifacts).toEqual([
      { path: "docs/old.md", label: "旧文档" },
      { path: "docs/requirements.md", label: "需求文档", summary: "docs/requirements.md" },
    ]);
    expect(merged?.trackedFiles).toContain("docs/requirements.md");
  });
});
