import type { InteractiveQaPayload } from "@/lib/docx-workflow";

export type InteractiveQaFlowState = {
  currentStep: number;
  reviewMode: boolean;
  returnToReview: boolean;
  selectedOptions: number[];
  customAnswers: string[];
};

export function createInitialInteractiveQaFlowState(
  payload: InteractiveQaPayload,
): InteractiveQaFlowState {
  return {
    currentStep: 0,
    reviewMode: false,
    returnToReview: false,
    selectedOptions: payload.questions.map((question) =>
      resolveRecommendedOptionIndex(question.options),
    ),
    customAnswers: payload.questions.map(() => ""),
  };
}

export function resolveInteractiveQaAnswer(
  question: InteractiveQaPayload["questions"][number],
  selectedOptionIndex: number,
  customAnswer: string,
) {
  const normalizedCustomAnswer = customAnswer.trim();
  if (normalizedCustomAnswer) return normalizedCustomAnswer;
  return question.options[selectedOptionIndex]?.label ?? "";
}

export function collectInteractiveQaAnswers(
  payload: InteractiveQaPayload,
  state: Pick<InteractiveQaFlowState, "selectedOptions" | "customAnswers">,
) {
  return payload.questions.map((question, index) =>
    resolveInteractiveQaAnswer(
      question,
      state.selectedOptions[index] ?? 0,
      state.customAnswers[index] ?? "",
    ),
  );
}

export function selectInteractiveQaOption(
  state: InteractiveQaFlowState,
  questionIndex: number,
  optionIndex: number,
): InteractiveQaFlowState {
  return {
    ...state,
    selectedOptions: state.selectedOptions.map((value, index) =>
      index === questionIndex ? optionIndex : value,
    ),
    customAnswers: state.customAnswers.map((value, index) =>
      index === questionIndex ? "" : value,
    ),
  };
}

export function updateInteractiveQaCustomAnswer(
  state: InteractiveQaFlowState,
  questionIndex: number,
  value: string,
): InteractiveQaFlowState {
  return {
    ...state,
    customAnswers: state.customAnswers.map((answer, index) =>
      index === questionIndex ? value : answer,
    ),
  };
}

export function confirmInteractiveQaCurrentStep(
  state: InteractiveQaFlowState,
  payload: InteractiveQaPayload,
): InteractiveQaFlowState {
  if (state.returnToReview) {
    return {
      ...state,
      reviewMode: true,
      returnToReview: false,
    };
  }

  if (state.currentStep >= payload.questions.length - 1) {
    return {
      ...state,
      reviewMode: true,
    };
  }

  return {
    ...state,
    currentStep: state.currentStep + 1,
  };
}

export function goToPreviousInteractiveQaStep(
  state: InteractiveQaFlowState,
): InteractiveQaFlowState {
  if (state.returnToReview || state.currentStep === 0) {
    return state;
  }

  return {
    ...state,
    currentStep: state.currentStep - 1,
  };
}

export function editInteractiveQaStep(
  state: InteractiveQaFlowState,
  stepIndex: number,
): InteractiveQaFlowState {
  return {
    ...state,
    currentStep: stepIndex,
    reviewMode: false,
    returnToReview: true,
  };
}

function resolveRecommendedOptionIndex(
  options: InteractiveQaPayload["questions"][number]["options"],
) {
  const recommendedIndex = options.findIndex((option) => option.recommended);
  return recommendedIndex >= 0 ? recommendedIndex : 0;
}
