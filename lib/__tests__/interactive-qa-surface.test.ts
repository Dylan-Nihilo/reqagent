import { describe, expect, it, vi } from "vitest";
import {
  resolveAssistantTextSurface,
  resolveInteractiveQaSubmitter,
} from "@/lib/interactive-qa-surface";

describe("resolveAssistantTextSurface", () => {
  it("returns interactive qa surface for complete interactive_qa blocks", () => {
    const surface = resolveAssistantTextSurface(`
[interactive_qa]
title: 需求文档范围确认
summary: 请先确认几个关键决策。
question: 这个需求文档主要面向哪种类型的功能或系统？
option*: 金融类业务系统
option: 通用企业内部管理系统
[/interactive_qa]
`);

    expect(surface.kind).toBe("interactive-qa");
    if (surface.kind !== "interactive-qa") {
      throw new Error("expected interactive-qa surface");
    }

    expect(surface.payload.title).toBe("需求文档范围确认");
    expect(surface.payload.questions).toHaveLength(1);
  });

  it("falls back to markdown when there is no interactive_qa payload", () => {
    const surface = resolveAssistantTextSurface("普通 markdown 回复");

    expect(surface).toEqual({
      kind: "markdown",
      markdown: "普通 markdown 回复",
    });
  });
});

describe("resolveInteractiveQaSubmitter", () => {
  it("returns undefined when runtime is unavailable", () => {
    const setText = vi.fn();
    const append = vi.fn();
    const composer = Object.assign(vi.fn(() => ({ getState: () => ({}), setText })), {
      source: null,
    }) as (() => { getState: () => {}; setText: typeof setText }) & {
      source: string | null;
    };
    const thread = Object.assign(vi.fn(() => ({ append })), {
      source: "root",
    }) as (() => { append: typeof append }) & {
      source: string | null;
    };

    const submitter = resolveInteractiveQaSubmitter({ composer, thread });

    expect(submitter).toBeUndefined();
    expect(composer).not.toHaveBeenCalled();
    expect(setText).not.toHaveBeenCalled();
    expect(thread).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("appends the final reply with runConfig and clears the composer", async () => {
    const setText = vi.fn();
    const append = vi.fn();
    const composer = Object.assign(
      vi.fn(() => ({
        getState: () => ({ runConfig: { channel: "docx" } }),
        setText,
      })),
      {
        source: "root",
      },
    ) as (() => {
      getState: () => { runConfig: { channel: string } };
      setText: typeof setText;
    }) & {
      source: "root",
    };
    const thread = Object.assign(vi.fn(() => ({ append })), {
      source: "root",
    }) as (() => { append: typeof append }) & {
      source: string | null;
    };

    const submitter = resolveInteractiveQaSubmitter({ composer, thread });

    expect(submitter).toBeTypeOf("function");
    expect(composer).not.toHaveBeenCalled();
    expect(thread).not.toHaveBeenCalled();

    await submitter?.(
      {
        title: "需求文档范围确认",
        summary: "请先确认几个关键决策。",
        questions: [
          {
            prompt: "系统面向哪类业务？",
            options: [{ label: "金融业务系统", recommended: true }],
          },
        ],
      },
      ["金融业务系统"],
    );

    expect(composer).toHaveBeenCalledTimes(2);
    expect(thread).toHaveBeenCalledTimes(1);
    expect(setText).toHaveBeenCalledWith("");
    expect(append).toHaveBeenCalledWith({
      content: [{ type: "text", text: "补充信息如下：\n- 系统面向哪类业务：金融业务系统" }],
      runConfig: { channel: "docx" },
    });
  });
});
