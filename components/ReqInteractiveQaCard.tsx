"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type InteractiveQaPayload,
} from "@/lib/docx-workflow";
import {
  collectInteractiveQaAnswers,
  confirmInteractiveQaCurrentStep,
  createInitialInteractiveQaFlowState,
  editInteractiveQaStep,
  goToPreviousInteractiveQaStep,
  type InteractiveQaFlowState,
  selectInteractiveQaOption,
  updateInteractiveQaCustomAnswer,
} from "@/lib/interactive-qa-flow";
import {
  ReqArrowLeftIcon,
  ReqArrowRightIcon,
  ReqChatIcon,
  ReqSparkIcon,
} from "@/components/ReqIcons";
import styles from "@/components/ReqInteractiveQaCard.module.css";

type ReqInteractiveQaCardProps = {
  payload: InteractiveQaPayload;
  roundsRemaining?: number;
  onSubmitAnswers?: (payload: InteractiveQaPayload, answers: string[]) => Promise<void> | void;
  surfaceState?: "interactive" | "submitted" | "historical";
};

export function ReqInteractiveQaCard({
  payload,
  roundsRemaining,
  onSubmitAnswers,
  surfaceState = "interactive",
}: ReqInteractiveQaCardProps) {
  const questionCount = payload.questions.length;
  const payloadResetKey = useMemo(() => JSON.stringify(payload), [payload]);
  const resetPayload = useMemo(
    () => JSON.parse(payloadResetKey) as InteractiveQaPayload,
    [payloadResetKey],
  );
  const [flowState, setFlowState] = useState<InteractiveQaFlowState>(() =>
    createInitialInteractiveQaFlowState(resetPayload),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedAnswers, setSubmittedAnswers] = useState<string[] | null>(null);

  useEffect(() => {
    setFlowState(createInitialInteractiveQaFlowState(resetPayload));
    setIsSubmitting(false);
    setSubmitError(null);
    setSubmittedAnswers(null);
  }, [resetPayload]);

  const answers = useMemo(
    () => collectInteractiveQaAnswers(payload, flowState),
    [flowState, payload],
  );
  const currentQuestion = payload.questions[flowState.currentStep];
  const currentAnswer = currentQuestion
    ? answers[flowState.currentStep] || "待补充"
    : "";
  const isReadOnly = surfaceState !== "interactive";
  const hasSubmittedAnswers = submittedAnswers !== null;
  const showReview = flowState.reviewMode && !isReadOnly && !hasSubmittedAnswers;
  const primaryLabel = flowState.returnToReview
    ? "确认修改"
    : flowState.currentStep >= questionCount - 1
      ? "进入复核"
      : "确认这一项";

  if (questionCount === 0) {
    return (
      <section className={styles.card}>
        <div className={styles.head}>
          <div className={styles.identity}>
            <span className={styles.eyebrow}>决策确认</span>
            <h3 className={styles.title}>{payload.title || "当前无需补充确认"}</h3>
            <p className={styles.summary}>
              {payload.summary || "没有需要确认的问题"}
            </p>
          </div>

          <div className={styles.metaRail}>
            <span className={styles.metaPill}>
              <ReqChatIcon className={styles.metaIcon} />
              0 个问题
            </span>
            {typeof roundsRemaining === "number" ? (
              <span className={styles.metaPill}>
                <ReqSparkIcon className={styles.metaIcon} />
                还可追问 {roundsRemaining} 轮
              </span>
            ) : null}
          </div>
        </div>

        <section className={styles.reviewPanel}>
          <div className={styles.reviewHead}>
            <p className={styles.reviewEyebrow}>无需操作</p>
            <h4 className={styles.reviewTitle}>没有需要确认的问题</h4>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <div className={styles.head}>
        <div className={styles.identity}>
          <span className={styles.eyebrow}>决策确认</span>
          <h3 className={styles.title}>
            {payload.title || `继续生成前先确认 ${payload.questions.length} 项`}
          </h3>
          <p className={styles.summary}>
            {payload.summary || "我先整理了更稳妥的决策方向。直接点选即可；都不合适，再写你的实际情况。"}
          </p>
        </div>

        <div className={styles.metaRail}>
          <span className={styles.metaPill}>
            <ReqChatIcon className={styles.metaIcon} />
            {questionCount} 个问题
          </span>
          {typeof roundsRemaining === "number" ? (
            <span className={styles.metaPill}>
              <ReqSparkIcon className={styles.metaIcon} />
              还可追问 {roundsRemaining} 轮
            </span>
          ) : null}
        </div>
      </div>

      {hasSubmittedAnswers ? (
        <section className={styles.reviewPanel}>
          <div className={styles.reviewHead}>
            <p className={styles.reviewEyebrow}>已提交</p>
            <h4 className={styles.reviewTitle}>确认内容已发送，等待 assistant 继续处理。</h4>
          </div>

          <div className={styles.reviewList}>
            {submittedAnswers.map((answer, index) => (
              <article className={styles.reviewItem} key={`${payload.questions[index]?.prompt}-${index}`}>
                <div className={styles.reviewItemCopy}>
                  <p className={styles.reviewPrompt}>{payload.questions[index]?.prompt}</p>
                  <p className={styles.reviewAnswer}>{answer}</p>
                </div>
                <span className={styles.reviewLock}>
                  {surfaceState === "historical" ? "已结束" : "已发送"}
                </span>
              </article>
            ))}
          </div>
        </section>
      ) : isReadOnly ? (
        <section className={styles.reviewPanel}>
          <div className={styles.reviewHead}>
            <p className={styles.reviewEyebrow}>该轮确认已结束</p>
            <h4 className={styles.reviewTitle}>这是上一轮决策确认，当前会话已进入后续步骤。</h4>
          </div>
          <p className={styles.reviewHint}>如需查看最终回答，直接看这条消息后面的用户回复。</p>
        </section>
      ) : showReview ? (
        <section className={styles.reviewPanel}>
          <div className={styles.reviewHead}>
            <p className={styles.reviewEyebrow}>最终复核</p>
            <h4 className={styles.reviewTitle}>确认无误后再继续生成。</h4>
          </div>

          <div className={styles.reviewList}>
            {payload.questions.map((question, questionIndex) => (
              <article className={styles.reviewItem} key={`${question.prompt}-${questionIndex}`}>
                <div className={styles.reviewItemCopy}>
                  <p className={styles.reviewPrompt}>{question.prompt}</p>
                  <p className={styles.reviewAnswer}>{answers[questionIndex] || "待补充"}</p>
                </div>
                <button
                  className={styles.reviewEditButton}
                  disabled={isSubmitting}
                  onClick={() =>
                    setFlowState((current) => editInteractiveQaStep(current, questionIndex))
                  }
                  type="button"
                >
                  返回该题
                </button>
              </article>
            ))}
          </div>

          {submitError ? <p className={styles.errorText}>{submitError}</p> : null}

          <div className={styles.actionRow}>
            <button
              className={styles.secondaryButton}
              disabled={isSubmitting}
              onClick={() =>
                setFlowState((current) =>
                  editInteractiveQaStep(current, payload.questions.length - 1),
                )
              }
              type="button"
            >
              <ReqArrowLeftIcon className={styles.actionIcon} />
              返回上一题
            </button>
            <button
              className={styles.primaryButton}
              disabled={!onSubmitAnswers || isSubmitting}
              onClick={async () => {
                if (!onSubmitAnswers || isSubmitting) return;

                setIsSubmitting(true);
                setSubmitError(null);
                try {
                  await onSubmitAnswers(payload, answers);
                  setSubmittedAnswers(answers);
                } catch {
                  setSubmitError("提交失败，请再试一次。");
                } finally {
                  setIsSubmitting(false);
                }
              }}
              type="button"
            >
              <ReqArrowRightIcon className={styles.actionIcon} />
              {isSubmitting ? "提交中..." : "确认并继续"}
            </button>
          </div>
        </section>
      ) : (
        <section className={styles.questionCard}>
          <div className={styles.stepRail}>
            <span className={styles.stepIndex}>
              第 {flowState.currentStep + 1} / {questionCount} 题
            </span>
            <span className={styles.questionMode}>
              {flowState.returnToReview ? "修改后返回复核" : "逐题确认"}
            </span>
          </div>

          <div className={styles.questionIntro}>
            <h4 className={styles.questionTitle}>{currentQuestion?.prompt}</h4>
            <p className={styles.questionCurrent}>
              <span className={styles.questionCurrentLabel}>当前回答</span>
              <span className={styles.questionCurrentValue}>{currentAnswer}</span>
            </p>
          </div>

          <div
            aria-label={`${currentQuestion?.prompt ?? "当前问题"} 的选项`}
            className={styles.optionList}
          >
            {currentQuestion?.options.map((option, optionIndex) => {
              const selected =
                flowState.selectedOptions[flowState.currentStep] === optionIndex &&
                !flowState.customAnswers[flowState.currentStep]?.trim();

              return (
                <button
                  aria-pressed={selected}
                  className={[
                    styles.optionButton,
                    selected ? styles.optionButtonSelected : "",
                  ].join(" ").trim()}
                  disabled={isSubmitting}
                  key={`${option.label}-${optionIndex}`}
                  onClick={() =>
                    setFlowState((current) =>
                      selectInteractiveQaOption(
                        current,
                        flowState.currentStep,
                        optionIndex,
                      ),
                    )
                  }
                  type="button"
                >
                  <span className={styles.optionLead}>
                    <span className={styles.optionKey}>{resolveOptionKey(optionIndex)}</span>
                    <span className={styles.optionLabel}>{option.label}</span>
                  </span>

                  <span className={styles.optionMeta}>
                    {option.recommended ? (
                      <span className={styles.optionBadge}>推荐</span>
                    ) : null}
                    {selected ? (
                      <span className={styles.optionState}>已选</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <label className={styles.customField}>
            <span className={styles.customHead}>
              <span className={styles.customLabel}>其他回答</span>
              <span className={styles.customHint}>推荐都不合适时，再手动补充</span>
            </span>
            <textarea
              aria-label={`${currentQuestion?.prompt ?? "当前问题"} 的其他回答`}
              className={styles.customInput}
              disabled={isSubmitting}
              onChange={(event) =>
                setFlowState((current) =>
                  updateInteractiveQaCustomAnswer(
                    current,
                    flowState.currentStep,
                    event.target.value,
                  ),
                )
              }
              placeholder="直接写你的实际情况、限制条件，或需要特殊处理的点。"
              rows={3}
              value={flowState.customAnswers[flowState.currentStep] ?? ""}
            />
          </label>

          {submitError ? <p className={styles.errorText}>{submitError}</p> : null}

          <div className={styles.actionRow}>
            {flowState.returnToReview ? null : flowState.currentStep > 0 ? (
              <button
                className={styles.secondaryButton}
                disabled={isSubmitting}
                onClick={() =>
                  setFlowState((current) => goToPreviousInteractiveQaStep(current))
                }
                type="button"
              >
                <ReqArrowLeftIcon className={styles.actionIcon} />
                上一步
              </button>
            ) : (
              <span className={styles.actionSpacer} aria-hidden="true" />
            )}
            <button
              className={styles.primaryButton}
              disabled={isSubmitting}
              onClick={() =>
                setFlowState((current) =>
                  confirmInteractiveQaCurrentStep(current, payload),
                )
              }
              type="button"
            >
              <ReqArrowRightIcon className={styles.actionIcon} />
              {primaryLabel}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}

function resolveOptionKey(index: number) {
  return String.fromCharCode(65 + index);
}
