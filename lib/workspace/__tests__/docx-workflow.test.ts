import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  buildDocxClarificationHint,
  extractInteractiveQaPayload,
  getDocxClarificationState,
} from "../../docx-workflow";

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

describe("extractInteractiveQaPayload", () => {
  it("parses a multiline interactive qa block", () => {
    const payload = extractInteractiveQaPayload(`
[interactive_qa]
title: 需求文档范围确认
summary: 请先确认业务范围。
question: 这个需求文档主要面向哪种系统？
option*: 金融类业务系统
option: 通用企业内部管理系统
[/interactive_qa]
`);

    expect(payload?.title).toBe("需求文档范围确认");
    expect(payload?.questions).toHaveLength(1);
    expect(payload?.questions[0]?.options[0]).toEqual({
      label: "金融类业务系统",
      recommended: true,
    });
  });

  it("parses a single-line interactive qa block", () => {
    const payload = extractInteractiveQaPayload(
      "[interactive_qa] title: 需求文档范围确认 summary: 请从以下选项中选择最接近你意图的方向。 question: 这个需求文档主要面向哪种类型的功能或系统？ option*: 金融类业务系统（如贷款审批、账户管理、支付结算等），需符合银行业监管要求 option: 通用企业内部管理系统（如OA、HR、工单系统） option: 客户端产品或互联网服务（如App、Web平台） option: 其他（请说明） [/interactive_qa]",
    );

    expect(payload?.title).toBe("需求文档范围确认");
    expect(payload?.summary).toContain("最接近你意图");
    expect(payload?.questions).toHaveLength(1);
    expect(payload?.questions[0]?.prompt).toContain("主要面向哪种类型");
    expect(payload?.questions[0]?.options).toHaveLength(4);
    expect(payload?.questions[0]?.options[0]?.recommended).toBe(true);
  });
});
