import type { ToolInvocationViewState } from "@/lib/types";

export type ToolInvocationStateTone = "working" | "success" | "danger" | "approval";

export type ToolInvocationStateMeta = {
  state: ToolInvocationViewState;
  label: string;
  hint: string;
  tone: ToolInvocationStateTone;
  isActive: boolean;
  isTerminalRunning: boolean;
  captions: {
    input: string;
    execution: string;
    result: string;
  };
};

const toolInvocationStateMetaMap: Record<ToolInvocationViewState, ToolInvocationStateMeta> = {
  drafting_input: {
    state: "drafting_input",
    label: "组装输入",
    hint: "参数仍在流式形成",
    tone: "working",
    isActive: true,
    isTerminalRunning: true,
    captions: {
      input: "流式参数",
      execution: "执行阶段",
      result: "尚未结束",
    },
  },
  input_ready: {
    state: "input_ready",
    label: "输入就绪",
    hint: "调用条件已经完整",
    tone: "working",
    isActive: true,
    isTerminalRunning: false,
    captions: {
      input: "参数已收齐",
      execution: "执行阶段",
      result: "尚未结束",
    },
  },
  input_invalid: {
    state: "input_invalid",
    label: "输入异常",
    hint: "参数未通过校验",
    tone: "danger",
    isActive: false,
    isTerminalRunning: false,
    captions: {
      input: "输入校验失败",
      execution: "执行阶段",
      result: "尚未结束",
    },
  },
  awaiting_approval: {
    state: "awaiting_approval",
    label: "等待审批",
    hint: "高影响动作等待确认",
    tone: "approval",
    isActive: true,
    isTerminalRunning: false,
    captions: {
      input: "参数已收齐",
      execution: "等待人工确认",
      result: "尚未结束",
    },
  },
  executing: {
    state: "executing",
    label: "执行中",
    hint: "工具已经开始运行",
    tone: "working",
    isActive: true,
    isTerminalRunning: true,
    captions: {
      input: "参数已收齐",
      execution: "动作进行中",
      result: "尚未结束",
    },
  },
  streaming_output: {
    state: "streaming_output",
    label: "流式输出",
    hint: "结果持续返回中",
    tone: "working",
    isActive: true,
    isTerminalRunning: true,
    captions: {
      input: "参数已收齐",
      execution: "持续返回结果",
      result: "结果流",
    },
  },
  succeeded: {
    state: "succeeded",
    label: "已完成",
    hint: "结果已稳定，可按需展开",
    tone: "success",
    isActive: false,
    isTerminalRunning: false,
    captions: {
      input: "参数已收齐",
      execution: "执行完成",
      result: "回执稳定",
    },
  },
  denied: {
    state: "denied",
    label: "已拒绝",
    hint: "动作被人工阻止",
    tone: "approval",
    isActive: false,
    isTerminalRunning: false,
    captions: {
      input: "参数已收齐",
      execution: "人工拒绝",
      result: "人工拒绝",
    },
  },
  failed: {
    state: "failed",
    label: "执行失败",
    hint: "执行过程报错或中断",
    tone: "danger",
    isActive: false,
    isTerminalRunning: false,
    captions: {
      input: "参数已收齐",
      execution: "执行阶段",
      result: "执行失败",
    },
  },
};

export const toolInvocationStateCatalog = Object.values(toolInvocationStateMetaMap);

export function getToolInvocationStateMeta(state: ToolInvocationViewState): ToolInvocationStateMeta {
  return toolInvocationStateMetaMap[state];
}

export function getToolInvocationStateLabel(state: ToolInvocationViewState) {
  return getToolInvocationStateMeta(state).label;
}

export function isActiveToolInvocationState(state: ToolInvocationViewState) {
  return getToolInvocationStateMeta(state).isActive;
}

export function isTerminalRunningToolInvocationState(state: ToolInvocationViewState) {
  return getToolInvocationStateMeta(state).isTerminalRunning;
}

export function getToolInputCaption(state: ToolInvocationViewState) {
  return getToolInvocationStateMeta(state).captions.input;
}

export function getToolExecutionCaption(state: ToolInvocationViewState) {
  return getToolInvocationStateMeta(state).captions.execution;
}

export function getToolResultCaption(state: ToolInvocationViewState) {
  return getToolInvocationStateMeta(state).captions.result;
}
