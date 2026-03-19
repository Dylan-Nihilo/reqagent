"use client";

import { MessagePrimitive, ThreadPrimitive, useThread } from "@assistant-ui/react";
import { ReqComposer } from "@/components/ReqComposer";
import { ReqEmptyState } from "@/components/ReqEmptyState";
import { ReqMessage } from "@/components/ReqMessage";
import { ReqReasoningPart } from "@/components/ReqReasoningPart";
import { ReqStreamingIndicator } from "@/components/ReqStreamingIndicator";
import { ReqTextPart } from "@/components/ReqTextPart";
import { ReqToolCallPart } from "@/components/ReqToolCallPart";
import { ReqScrollToBottom } from "@/components/ReqScrollToBottom";
import styles from "@/components/ReqAgentWorkbench.module.css";

export function ReqAgentUI() {
  const isEmpty = useThread((s) => s.messages.length === 0);

  if (isEmpty) {
    return (
      <main className={styles.page}>
        <div className={`${styles.shell} ${styles.shellLanding}`}>
          <section className={styles.landing}>
            <ReqEmptyState
              description="输入任意内容开始对话。"
              title="ReqAgent"
            >
              <ReqComposer
                hint="shift + enter 换行"
                placeholder="说点什么……"
                variant="landing"
              />
            </ReqEmptyState>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <ThreadPrimitive.Root className={styles.threadRoot}>
          <ThreadPrimitive.Viewport
            autoScroll
            className={styles.viewport}
            scrollToBottomOnInitialize
            scrollToBottomOnRunStart
            turnAnchor="bottom"
          >
            <div className={styles.threadContent}>
              <ThreadPrimitive.Messages
                components={{
                  UserMessage,
                  AssistantMessage,
                }}
              />
            </div>

            <ThreadPrimitive.ViewportFooter className={styles.viewportFooter}>
              <div className={styles.viewportFooterInner}>
                <ThreadPrimitive.ScrollToBottom
                  behavior="smooth"
                  className={styles.scrollToBottomButton}
                >
                  <ReqScrollToBottom>回到底部</ReqScrollToBottom>
                </ThreadPrimitive.ScrollToBottom>
                <ReqComposer
                  hint="shift + enter 换行"
                  placeholder="继续对话……"
                  variant="thread"
                />
              </div>
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </div>
    </main>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className={styles.messageRoot}>
      <ReqMessage role="user">
        <MessagePrimitive.Parts />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={styles.messageRoot}>
      <ReqMessage role="assistant">
        <MessagePrimitive.Parts
          components={{
            Empty: ReqStreamingIndicator,
            Text: ReqTextPart,
            Reasoning: ReqReasoningPart,
            tools: { Fallback: ReqToolCallPart },
          }}
        />
      </ReqMessage>
    </MessagePrimitive.Root>
  );
}
