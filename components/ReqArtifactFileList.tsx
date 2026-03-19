"use client";

import styles from "@/components/ReqAgentPrimitives.module.css";

type ReqArtifactFileListItem = {
  id: string;
  name: string;
  description: string;
  meta: string;
  statusLabel?: string;
};

type ReqArtifactFileListProps = {
  title: string;
  count: number;
  items: ReqArtifactFileListItem[];
};

export function ReqArtifactFileList({ title, count, items }: ReqArtifactFileListProps) {
  return (
    <aside className={styles.artifactRail}>
      <div className={styles.railHead}>
        <div>
          <p className={styles.railLabel}>Artifacts</p>
          <h2 className={styles.railTitle}>{title}</h2>
        </div>
        <span className={styles.railMeta}>{count} items</span>
      </div>

      <div className={styles.artifactList}>
        {items.map((item) => (
          <article key={item.id} className={styles.artifactItem}>
            <div className={styles.artifactMarker} />
            <div className={styles.artifactContent}>
              <p className={styles.artifactName}>{item.name}</p>
              <p className={styles.artifactDescription}>{item.description}</p>
              <p className={styles.artifactMeta}>{item.meta}</p>
            </div>
            <span className={styles.artifactBadge}>{item.statusLabel ?? "ready"}</span>
          </article>
        ))}
      </div>
    </aside>
  );
}
