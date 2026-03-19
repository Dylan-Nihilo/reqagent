"use client";

import type { ReactNode } from "react";
import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqMessageProps = {
  role: "user" | "assistant";
  avatarLabel?: string;
  children: ReactNode;
  className?: string;
};

export function ReqMessage({ role, avatarLabel, children, className }: ReqMessageProps) {
  const isUser = role === "user";

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.messageRowUser : ""} ${className ?? ""}`.trim()}>
      <div className={`${styles.avatar} ${isUser ? styles.avatarUser : styles.avatarAssistant}`}>
        {avatarLabel ?? (isUser ? "U" : "AI")}
      </div>
      <div className={`${styles.messageBlock} ${isUser ? styles.messageBlockUser : ""}`}>
        <div className={`${styles.messageBody} ${isUser ? styles.messageBodyUser : styles.messageBodyAssistant}`}>
          <div className={`${styles.messageParts} ${isUser ? styles.messagePartsUser : styles.messagePartsAssistant}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
