import type { ReqAgentLoadedSkillMeta, SkillManifest } from "./types";

/**
 * Intent patterns — match against the USER's message to decide which skills
 * are relevant BEFORE the AI starts generating. This is the agent-native
 * pattern: decide what knowledge to activate, show "loaded skill X", then
 * generate the response using that knowledge.
 */
type SkillMatcher = {
  skillId: string;
  /** Returns true if the user's message suggests this skill is needed. */
  test: (userMessage: string) => boolean;
};

const SKILL_MATCHERS: SkillMatcher[] = [
  {
    skillId: "demo-prd-docx",
    test: (msg) => {
      const patterns = [
        /docx/i,
        /导出.{0,4}文档/,
        /输出.{0,4}文档/,
        /模板/,
        /生成.{0,6}(需求|PRD)/,
      ];
      return patterns.some((p) => p.test(msg));
    },
  },
  {
    skillId: "req-prd-generic",
    test: (msg) => {
      const patterns = [
        /PRD/i,
        /需求文档/,
        /产品需求/,
        /写.{0,6}需求/,
        /分析.{0,6}需求/,
        /整理.{0,6}需求/,
        /拆解.{0,6}需求/,
        /需求分析/,
        /功能需求/,
        /用户故事/,
        /user\s*stor/i,
        /acceptance\s*criteria/i,
        /验收标准/,
        /产品文档/,
        /产品规划/,
        /MoSCoW/i,
      ];
      return patterns.some((p) => p.test(msg));
    },
  },
  {
    skillId: "cap-mermaid",
    test: (msg) => {
      const patterns = [
        /mermaid/i,
        /流程图/,
        /时序图/,
        /类图/,
        /状态图/,
        /ER\s*图/i,
        /甘特图/,
        /画.{0,4}图/,
        /生成.{0,4}图/,
        /diagram/i,
        /flowchart/i,
        /sequence\s*diagram/i,
        /可视化/,
        /架构图/,
        /数据流/,
      ];
      return patterns.some((p) => p.test(msg));
    },
  },
];

/**
 * Match user message against available skills, returning only the ones
 * whose intent patterns match. Called once before streaming starts.
 */
export function matchSkillsForMessage(
  userMessage: string,
  loadedSkills: ReadonlyArray<SkillManifest>,
): ReqAgentLoadedSkillMeta[] {
  const loadedIds = new Set(loadedSkills.map((s) => s.id));
  const matched: ReqAgentLoadedSkillMeta[] = [];

  for (const matcher of SKILL_MATCHERS) {
    if (!loadedIds.has(matcher.skillId)) continue;
    if (matcher.test(userMessage)) {
      const skill = loadedSkills.find((s) => s.id === matcher.skillId);
      if (skill) {
        matched.push({ id: skill.id, name: skill.name, type: skill.type });
      }
    }
  }

  return matched;
}
