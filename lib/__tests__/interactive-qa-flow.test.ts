import { describe, expect, it } from "vitest";
import type { InteractiveQaPayload } from "@/lib/docx-workflow";
import {
  collectInteractiveQaAnswers,
  confirmInteractiveQaCurrentStep,
  createInitialInteractiveQaFlowState,
  editInteractiveQaStep,
  goToPreviousInteractiveQaStep,
  updateInteractiveQaCustomAnswer,
} from "@/lib/interactive-qa-flow";

const payload: InteractiveQaPayload = {
  title: "需求文档范围确认",
  summary: "请先确认几个关键决策。",
  questions: [
    {
      prompt: "系统面向哪类业务？",
      options: [
        { label: "金融业务系统", recommended: true },
        { label: "企业内部系统", recommended: false },
      ],
    },
    {
      prompt: "谁是主要使用角色？",
      options: [
        { label: "业务运营", recommended: true },
        { label: "终端客户", recommended: false },
      ],
    },
  ],
};

describe("interactive qa flow", () => {
  it("advances one question at a time and enters review after the last confirmation", () => {
    let state = createInitialInteractiveQaFlowState(payload);

    expect(state.currentStep).toBe(0);
    expect(state.reviewMode).toBe(false);

    state = confirmInteractiveQaCurrentStep(state, payload);
    expect(state.currentStep).toBe(1);
    expect(state.reviewMode).toBe(false);

    state = confirmInteractiveQaCurrentStep(state, payload);
    expect(state.currentStep).toBe(1);
    expect(state.reviewMode).toBe(true);
  });

  it("prefers custom answers over selected options and preserves them when stepping back", () => {
    let state = createInitialInteractiveQaFlowState(payload);

    state = updateInteractiveQaCustomAnswer(state, 0, "面向跨部门审批平台");

    expect(collectInteractiveQaAnswers(payload, state)[0]).toBe("面向跨部门审批平台");

    state = confirmInteractiveQaCurrentStep(state, payload);
    state = goToPreviousInteractiveQaStep(state);

    expect(state.currentStep).toBe(0);
    expect(state.customAnswers[0]).toBe("面向跨部门审批平台");
    expect(collectInteractiveQaAnswers(payload, state)[0]).toBe("面向跨部门审批平台");
  });

  it("returns to review after editing a reviewed step", () => {
    let state = createInitialInteractiveQaFlowState(payload);
    state = confirmInteractiveQaCurrentStep(state, payload);
    state = confirmInteractiveQaCurrentStep(state, payload);

    expect(state.reviewMode).toBe(true);

    state = editInteractiveQaStep(state, 0);
    expect(state.reviewMode).toBe(false);
    expect(state.returnToReview).toBe(true);
    expect(state.currentStep).toBe(0);

    state = updateInteractiveQaCustomAnswer(state, 0, "改成客服与运营双角色");
    state = confirmInteractiveQaCurrentStep(state, payload);

    expect(state.reviewMode).toBe(true);
    expect(state.returnToReview).toBe(false);
    expect(collectInteractiveQaAnswers(payload, state)[0]).toBe("改成客服与运营双角色");
  });
});
