"use client";

import type { ReqAgentLoadedSkillMeta } from "@/lib/skills/types";
import styles from "@/components/ReqSkillLoadedChips.module.css";

type ReqSkillLoadedChipsProps = {
  skills: ReadonlyArray<ReqAgentLoadedSkillMeta>;
};

export function ReqSkillLoadedChips({ skills }: ReqSkillLoadedChipsProps) {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div className={styles.root}>
      <span className={styles.label}>已加载</span>
      <div className={styles.chips}>
        {skills.map((skill) => (
          <span key={skill.id} className={styles.chip}>
            <span className={styles.dot} data-type={skill.type} />
            <span className={styles.chipText}>{skill.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
