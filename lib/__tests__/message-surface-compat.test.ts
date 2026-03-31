import { describe, expect, it } from "vitest";
import {
  inferAgentActivityFromMessageParts,
  summarizeMessageParts,
} from "@/lib/message-parts";
import { resolveInteractiveQaCueSurface } from "@/lib/interactive-qa-surface";
import {
  extractTextFromThreadMessages,
  extractTextFromUIMessageParts,
} from "@/lib/threads";
import { extractTextFromMessageParts, readMessageParts } from "@/lib/ui-message-utils";

const qaBlock = `[interactive_qa]
title: 需求文档范围确认
summary: 为了生成符合预期的需求文档，请先确认以下信息。
question: 这个需求文档面向什么业务领域或系统？
option*: 企业内部管理系统
option: 互联网产品
[/interactive_qa]`;

const fullPartMatrix = [
  { type: "text", text: "正文" },
  { type: "reasoning", text: "推理过程" },
  { type: "tool-call", toolCallId: "tool-1", toolName: "writeFile", status: { type: "running" } },
  { type: "source", title: "Source", url: "https://example.com" },
  { type: "file", filename: "requirements.md", mimeType: "text/markdown", data: "abc" },
  { type: "image", image: "data:image/png;base64,abc", filename: "diagram.png" },
] as const;

describe("message surface compatibility", () => {
  it("reads message parts from raw arrays, content, and parts shapes", () => {
    expect(readMessageParts(fullPartMatrix)).toHaveLength(6);
    expect(readMessageParts({ content: fullPartMatrix })).toHaveLength(6);
    expect(readMessageParts({ parts: fullPartMatrix })).toHaveLength(6);
  });

  it("summarizes known LLM part kinds for both content and parts messages", () => {
    const contentKinds = summarizeMessageParts({ content: fullPartMatrix }).map((part) => part.kind);
    const partsKinds = summarizeMessageParts({ parts: fullPartMatrix }).map((part) => part.kind);

    expect(contentKinds).toEqual(["text", "reasoning", "tool", "source", "file", "image"]);
    expect(partsKinds).toEqual(["text", "reasoning", "tool", "source", "file", "image"]);
  });

  it("infers agent activity from AI SDK parts messages", () => {
    expect(
      inferAgentActivityFromMessageParts({
        parts: [{ type: "tool-call", toolCallId: "tool-1", toolName: "bash", status: { type: "running" } }],
      }),
    ).toBe("tool_calling");
  });

  it("extracts plain text from both parts-based and content-based thread messages", () => {
    expect(extractTextFromUIMessageParts([{ type: "text", text: "hello world" }])).toBe("hello world");
    expect(extractTextFromMessageParts({ content: [{ type: "text", text: "hello content" }] })).toBe("hello content");
    expect(
      extractTextFromThreadMessages([
        { role: "user", parts: [{ type: "text", text: "first via parts" }] },
        { role: "assistant", content: [{ type: "text", text: "fallback via content" }] },
      ]),
    ).toBe("first via parts");
  });

  it("resolves interactive qa cues from assistant messages regardless of content shape", () => {
    const metadata = {
      docxClarification: {
        roundsRemaining: 1,
      },
    } as never;

    const fromContent = resolveInteractiveQaCueSurface(
      { content: [{ type: "text", text: qaBlock }] },
      metadata,
    );
    const fromParts = resolveInteractiveQaCueSurface(
      { parts: [{ type: "text", text: qaBlock }] },
      metadata,
    );

    expect(fromContent?.payload.title).toBe("需求文档范围确认");
    expect(fromContent?.roundsRemaining).toBe(1);
    expect(fromParts?.payload.questions).toHaveLength(1);
  });

  it("does not surface interactive qa cue when the same message also contains tool output", () => {
    const cue = resolveInteractiveQaCueSurface({
      parts: [
        { type: "text", text: qaBlock },
        { type: "tool-call", toolCallId: "tool-1", toolName: "writeFile", status: { type: "running" } },
      ],
    });

    expect(cue).toBeNull();
  });
});
