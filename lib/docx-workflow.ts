import type { UIMessage } from "ai";
import { extractTextFromUIMessageParts } from "@/lib/threads";

const DOCX_INTENT_PATTERN =
  /docx|模板|需求文档|需求说明书|prd|导出.{0,4}文档|生成.{0,8}(文档|需求)|业务需求/i;

const CLARIFICATION_CUE_PATTERN =
  /[?？]|请确认|请补充|请提供|想确认|我再确认|再确认|方便提供|还需要|需要确认|还缺|想了解|可否提供/i;

const NON_CLARIFICATION_PATTERN =
  /已生成|已导出|已读取|可以，我已经读取|工作区文件如下|文档已|模板已|我已经/i;

const INTERACTIVE_QA_BLOCK_PATTERN = /\[interactive_qa\]([\s\S]*?)\[\/interactive_qa\]/i;
const INTERACTIVE_QA_FIELD_PATTERN = /(^|\s)(title|summary|question|option\*|option):/gi;

export type InteractiveQaOption = {
  label: string;
  recommended: boolean;
};

export type InteractiveQaQuestion = {
  prompt: string;
  options: InteractiveQaOption[];
};

export type InteractiveQaPayload = {
  title: string;
  summary: string;
  questions: InteractiveQaQuestion[];
};

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

export function extractInteractiveQaPayload(text: string): InteractiveQaPayload | null {
  const match = text.match(INTERACTIVE_QA_BLOCK_PATTERN);
  if (!match) return null;

  const block = match[1]?.trim();
  if (!block) return null;

  let title = "继续生成前请先确认";
  let summary = "我根据当前上下文给出推荐选项；如果都不合适，可以直接填写其他回答。";
  let currentQuestion: InteractiveQaQuestion | null = null;
  const questions: InteractiveQaQuestion[] = [];

  const commitQuestion = () => {
    if (!currentQuestion) return;

    const fallbackRecommended = currentQuestion.options.every((candidate) => !candidate.recommended);
    const normalizedOptions = currentQuestion.options.map((option, index) => {
      if (option.recommended) return option;
      if (fallbackRecommended && index === 0) {
        return {
          ...option,
          recommended: true,
        };
      }
      return option;
    });

    questions.push({
      prompt: currentQuestion.prompt,
      options: normalizedOptions,
    });
    currentQuestion = null;
  };

  const fields = tokenizeInteractiveQaBlock(block);

  for (const field of fields) {
    if (!field.value) continue;

    if (field.key === "title") {
      title = field.value;
      continue;
    }

    if (field.key === "summary") {
      summary = field.value;
      continue;
    }

    if (field.key === "question") {
      commitQuestion();
      currentQuestion = {
        prompt: field.value,
        options: [],
      };
      continue;
    }

    if (field.key === "option*" && currentQuestion) {
      currentQuestion.options.push({
        label: field.value,
        recommended: true,
      });
      continue;
    }

    if (field.key === "option" && currentQuestion) {
      currentQuestion.options.push({
        label: field.value,
        recommended: false,
      });
    }
  }

  commitQuestion();

  if (questions.length === 0 || questions.some((question) => question.options.length === 0)) {
    return null;
  }

  return {
    title,
    summary,
    questions,
  };
}

export function buildInteractiveQaReplyDraft(
  payload: InteractiveQaPayload | Pick<InteractiveQaPayload, "questions">,
  answers: string[],
) {
  return [
    "补充信息如下：",
    ...payload.questions.map((question, index) => {
      const answer = answers[index]?.trim() || "待补充";
      return `- ${normalizeInteractiveQaPrompt(question.prompt)}：${answer}`;
    }),
  ].join("\n");
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
    "如需继续提问，必须输出一个 [interactive_qa]...[/interactive_qa] 代码块，不要只发普通段落。",
    "代码块内使用以下格式：title: <标题>、summary: <说明>、question: <问题>、option*: <推荐项>、option: <备选项>。",
    "每个 question 必须给 2-4 个 option，且恰好 1 个 option* 作为推荐。选项要结合上下文给出决策建议，不能只写“其他，请补充”。",
    "summary 要明确：这些 option 是你基于当前上下文给出的推荐，用户仍可填写其他回答。",
    "禁止重复追问已知信息，禁止说“最后两个问题”后继续追加新问题。",
    "如用户已经给出核心目标、角色、范围和约束，就直接生成文档。",
  ].join("\n");
}

function normalizeInteractiveQaPrompt(value: string) {
  return value.replace(/[：:？?]\s*$/, "").trim();
}

function tokenizeInteractiveQaBlock(block: string) {
  const matches = [...block.matchAll(INTERACTIVE_QA_FIELD_PATTERN)];
  if (matches.length === 0) return [];

  return matches.map((match, index) => {
    const marker = match[2]?.toLowerCase() ?? "";
    const markerStart = (match.index ?? 0) + (match[1]?.length ?? 0);
    const valueStart = markerStart + marker.length + 1;
    const nextMarker = matches[index + 1];
    const valueEnd = nextMarker
      ? (nextMarker.index ?? block.length) + (nextMarker[1]?.length ?? 0)
      : block.length;

    return {
      key: marker,
      value: block.slice(valueStart, valueEnd).trim(),
    };
  });
}
