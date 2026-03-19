"use client";

import type { ReactNode } from "react";
import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqScrollToBottomProps = {
  children: ReactNode;
  className?: string;
};

export function ReqScrollToBottom({ children, className }: ReqScrollToBottomProps) {
  return <span className={`${styles.scrollPill} ${className ?? ""}`.trim()}>{children}</span>;
}
