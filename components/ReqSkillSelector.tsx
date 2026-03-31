"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReqAgentSkillManifest, ReqAgentSkillType } from "@/lib/skills/types";
import styles from "@/components/ReqSkillSelector.module.css";

type SkillListResponse = {
  skills?: ReqAgentSkillManifest[];
};

type ProjectConfigResponse = {
  defaultTemplateId?: string;
  enabledSkillIds?: string[];
};

type ReqSkillSelectorProps = {
  workspaceId: string;
};

export function ReqSkillSelector({ workspaceId }: ReqSkillSelectorProps) {
  void workspaceId;
  const [skills, setSkills] = useState<ReqAgentSkillManifest[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function persistEnabledSkillIds(ids: string[]) {
    const response = await fetch("/api/project/config", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabledSkillIds: ids,
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setIsLoading(true);
    setLoadError(null);

    Promise.all([
      fetch("/api/skills", {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        return response.json() as Promise<SkillListResponse>;
      }),
      fetch("/api/project/config", {
        cache: "no-store",
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }
        return response.json() as Promise<ProjectConfigResponse>;
      }),
    ])
      .then(([skillsPayload, configPayload]) => {
        if (cancelled) {
          return;
        }
        setSkills(Array.isArray(skillsPayload.skills) ? skillsPayload.skills : []);
        setActiveIds(
          new Set(
            Array.isArray(configPayload.enabledSkillIds)
              ? configPayload.enabledSkillIds
              : [],
          ),
        );
      })
      .catch((error: unknown) => {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : "技能列表加载失败";
        setLoadError(message);
        setSkills([]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (skills.length === 0) {
      return;
    }

    const validIds = new Set(skills.map((skill) => skill.id));
    setActiveIds((current) => {
      const next = new Set(
        Array.from(current).filter((skillId) => validIds.has(skillId)),
      );

      if (next.size !== current.size) {
        void persistEnabledSkillIds(Array.from(next)).catch(() => {
          setLoadError("同步项目技能配置失败");
        });
      }

      return next;
    });
  }, [skills]);

  const activeCount = activeIds.size;
  const orderedSkills = useMemo(
    () =>
      [...skills].sort((left, right) => {
        const leftEnabled = activeIds.has(left.id) ? 1 : 0;
        const rightEnabled = activeIds.has(right.id) ? 1 : 0;
        return rightEnabled - leftEnabled;
      }),
    [activeIds, skills],
  );

  function toggleSkill(skillId: string) {
    setActiveIds((current) => {
      const next = new Set(current);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }

      void persistEnabledSkillIds(Array.from(next)).catch(() => {
        setLoadError("同步项目技能配置失败");
      });
      return next;
    });
  }

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Skills</p>
          <h3 className={styles.heading}>已为当前项目装载的能力</h3>
          <p className={styles.description}>
            切换后立即写入项目配置，下一条消息开始生效。
          </p>
        </div>
        <span className={styles.counter}>
          {activeCount}/{skills.length || 0} 已启用
        </span>
      </header>

      {isLoading ? (
        <p className={styles.statusLine}>正在读取技能目录…</p>
      ) : null}

      {!isLoading && loadError ? (
        <p className={styles.statusLine}>{loadError}</p>
      ) : null}

      {!isLoading && !loadError && orderedSkills.length === 0 ? (
        <p className={styles.statusLine}>当前还没有可用 skill。</p>
      ) : null}

      {orderedSkills.length > 0 ? (
        <div className={styles.list}>
          {orderedSkills.map((skill) => {
            const isActive = activeIds.has(skill.id);

            return (
              <button
                key={skill.id}
                aria-pressed={isActive}
                className={[
                  styles.item,
                  isActive ? styles.itemActive : "",
                ].join(" ").trim()}
                onClick={() => toggleSkill(skill.id)}
                type="button"
              >
                <div className={styles.itemHead}>
                  <div className={styles.identity}>
                    <span className={styles.itemName}>{skill.name}</span>
                    <span className={styles.itemVersion}>v{skill.version}</span>
                  </div>
                  <div className={styles.metaRow}>
                    <span className={styles.typeBadge} data-type={skill.type}>
                      {getSkillTypeLabel(skill.type)}
                    </span>
                    <span
                      className={[
                        styles.toggle,
                        isActive ? styles.toggleActive : "",
                      ].join(" ").trim()}
                    >
                      <span className={styles.toggleThumb} />
                    </span>
                  </div>
                </div>
                <p className={styles.itemDesc}>{skill.description}</p>
                {skill.tags?.length ? (
                  <div className={styles.tags}>
                    {skill.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function getSkillTypeLabel(type: ReqAgentSkillType) {
  switch (type) {
    case "knowledge":
      return "知识";
    case "capability":
      return "能力";
    default:
      return "混合";
  }
}
