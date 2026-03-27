import type { UIMessage } from "ai";
import { extractTextFromUIMessageParts } from "@/lib/threads";

const DOCX_INTENT_PATTERN =
  /docx|模板|需求文档|需求说明书|prd|导出.{0,4}文档|生成.{0,8}(文档|需求)|业务需求/i;

const CLARIFICATION_CUE_PATTERN =
  /[?？]|请确认|请补充|请提供|想确认|我再确认|再确认|方便提供|还需要|需要确认|还缺|想了解|可否提供/i;

const NON_CLARIFICATION_PATTERN =
  /已生成|已导出|已读取|可以，我已经读取|工作区文件如下|文档已|模板已|我已经/i;

export type DocxClarificationState = {
  active: boolean;
  roundsUsed: number;
  roundsRemaining: number;
  forceDraft: boolean;
};

function isDocxIntent(text: string) {
  return DOCX_INTENT_PATTERN.test(text);
}

function looksLikeClarification(text: string) {
  if (!text) return false;
  if (NON_CLARIFICATION_PATTERN.test(text)) return false;
  return CLARIFICATION_CUE_PATTERN.test(text);
}

export function getDocxClarificationState(messages: ReadonlyArray<UIMessage>) {
  let firstIntentIndex = -1;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    const text = extractTextFromUIMessageParts(message.parts);
    if (isDocxIntent(text)) {
      firstIntentIndex = index;
      break;
    }
  }

  if (firstIntentIndex < 0) {
    return {
      active: false,
      roundsUsed: 0,
      roundsRemaining: 2,
      forceDraft: false,
    } satisfies DocxClarificationState;
  }

  let roundsUsed = 0;

  for (let index = firstIntentIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const text = extractTextFromUIMessageParts(message.parts);
    if (looksLikeClarification(text)) {
      roundsUsed += 1;
    }
  }

  return {
    active: true,
    roundsUsed,
    roundsRemaining: Math.max(0, 2 - roundsUsed),
    forceDraft: roundsUsed >= 2,
  } satisfies DocxClarificationState;
}

export function buildDocxClarificationHint(state: DocxClarificationState) {
  if (!state.active) return "";

  if (state.forceDraft) {
    return [
      "当前需求文档澄清预算已用尽（2/2 轮）。",
      "本轮禁止继续追问，直接进入生成或导出。",
      "缺失信息统一写入“假设 / 待确认”章节，不要再说“最后两个问题”。",
    ].join("\n");
  }

  return [
    `当前需求文档澄清预算：已使用 ${state.roundsUsed}/2 轮，还剩 ${state.roundsRemaining} 轮。`,
    "如确实缺信息，本轮最多提 2 个聚焦问题。",
    "禁止重复追问已知信息，禁止说“最后两个问题”后继续追加新问题。",
    "如用户已经给出核心目标、角色、范围和约束，就直接生成文档。",
  ].join("\n");
}
