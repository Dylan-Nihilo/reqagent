"use client";

import type { ReactNode } from "react";
import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqEmptyStateProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ReqEmptyState({ title, description, children }: ReqEmptyStateProps) {
  return (
    <section className={styles.emptyState}>
      <span className={styles.emptyMark}>ReqAgent</span>
      <h1 className={styles.emptyTitle}>{title}</h1>
      <p className={styles.emptyDescription}>{description}</p>
      <div className={styles.emptyComposer}>{children}</div>
    </section>
  );
}
