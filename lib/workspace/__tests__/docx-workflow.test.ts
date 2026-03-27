import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { buildDocxClarificationHint, getDocxClarificationState } from "../../docx-workflow";

function buildMessage(role: "user" | "assistant", text: string): UIMessage {
  return {
    id: `${role}-${text}`,
    role,
    parts: [{ type: "text" as const, text }],
  };
}

describe("getDocxClarificationState", () => {
  it("stays inactive when no docx intent exists", () => {
    const state = getDocxClarificationState([
      buildMessage("user", "帮我总结今天的会议纪要"),
    ]);

    expect(state.active).toBe(false);
    expect(state.roundsUsed).toBe(0);
    expect(state.forceDraft).toBe(false);
  });

  it("counts clarification rounds after docx intent", () => {
    const state = getDocxClarificationState([
      buildMessage("user", "请帮我生成需求说明书"),
      buildMessage("assistant", "请确认系统范围和主要使用角色？"),
      buildMessage("user", "范围是员工考勤"),
    ]);

    expect(state.active).toBe(true);
    expect(state.roundsUsed).toBe(1);
    expect(state.roundsRemaining).toBe(1);
    expect(state.forceDraft).toBe(false);
  });

  it("does not treat completion-style messages as clarification", () => {
    const state = getDocxClarificationState([
      buildMessage("user", "导出一份需求文档"),
      buildMessage("assistant", "已生成文档，请确认下载路径。"),
    ]);

    expect(state.roundsUsed).toBe(0);
    expect(state.forceDraft).toBe(false);
  });

  it("forces draft mode after two clarification rounds", () => {
    const state = getDocxClarificationState([
      buildMessage("user", "生成 DOCX 需求说明书"),
      buildMessage("assistant", "请补充业务目标和边界。"),
      buildMessage("user", "目标是考勤管理"),
      buildMessage("assistant", "还需要确认非功能要求和接口范围？"),
    ]);

    expect(state.roundsUsed).toBe(2);
    expect(state.roundsRemaining).toBe(0);
    expect(state.forceDraft).toBe(true);
    expect(buildDocxClarificationHint(state)).toContain("禁止继续追问");
  });
});
