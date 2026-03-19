"use client";

import styles from "@/components/ReqAgentWorkbench.module.css";
import { reqAgentStageLabels, reqAgentStageOrder, type ReqAgentPipeline, type ReqAgentRole, type ReqAgentStage } from "@/lib/types";

type PipelineBarProps = {
  currentAgent?: ReqAgentRole;
  pipeline: ReqAgentPipeline;
};

const steps: Array<{ stage: ReqAgentStage; label: string }> = reqAgentStageOrder.map((stage) => ({
  stage,
  label: reqAgentStageLabels[stage],
}));

const statusLabel = {
  idle: "未开始",
  running: "进行中",
  complete: "完成",
  failed: "失败",
  awaiting_input: "待补充",
} as const;

const statusClassName = {
  idle: styles.statusIdle,
  running: styles.statusRunning,
  complete: styles.statusComplete,
  failed: styles.statusIncomplete,
  awaiting_input: styles.statusIdle,
} as const;

export function PipelineBar({ currentAgent, pipeline }: PipelineBarProps) {
  return (
    <footer className={styles.footerBar}>
      <div className={styles.footerHead}>
        <div>
          <p className={styles.panelEyebrow}>Execution Chain</p>
          <h2 className={styles.panelTitle}>阶段状态</h2>
        </div>
        <div className={styles.agentChip}>
          <span className={styles.agentChipDot} />
          当前 Agent · {currentAgent ?? "Orchestrator"}
        </div>
      </div>

      <div className={styles.phaseGrid}>
        {steps.map((step) => (
          <section key={step.stage} className={styles.phaseCard}>
            <p className={styles.phaseTitle}>{step.label}</p>
            <div className={styles.phaseStatusRow}>
              <span className={`${styles.phaseDot} ${statusClassName[pipeline[step.stage]]}`} />
              <span className={styles.phaseStatusText}>{statusLabel[pipeline[step.stage]]}</span>
            </div>
          </section>
        ))}
      </div>
    </footer>
  );
}
