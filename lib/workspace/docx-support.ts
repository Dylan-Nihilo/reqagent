import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execa } from "execa";
import { marked } from "marked";
import { resolveWorkspacePath } from "@/lib/workspace/context";

export type DocxStyleSummary = {
  styleId: string;
  name: string;
};

export type DocxHeadingSummary = {
  level: number;
  text: string;
  styleId?: string;
  styleName?: string;
  paragraphIndex: number;
};

export type DocxTableSummary = {
  index: number;
  rowCount: number;
  columnCount: number;
  previewRows: string[][];
};

export type DocxStructureAnalysis = {
  title: string;
  headings: DocxHeadingSummary[];
  tables: DocxTableSummary[];
  styles: DocxStyleSummary[];
  hasToc: boolean;
  sectionCount: number;
  paragraphCount: number;
  tableCount: number;
  charCount: number;
  textContent: string;
  sectionCharCounts?: Array<{ heading: string; chars: number }>;
  relationIntegrity?: DocxRelationIntegrity;
  legacyContentHits?: Array<{ term: string; count: number }>;
};

export type DocxExportSource = {
  markdown: string;
  sourcePath?: string;
  title: string;
  outline: Array<{ level: number; text: string }>;
};

type RenderRequirementsDocHtmlOptions = {
  markdown: string;
  title: string;
  organization?: string;
  author?: string;
  version?: string;
  docDate?: string;
  includeToc?: boolean;
};

export type DocxRelationIntegrity = {
  missingTargets: string[];
  removedRelationshipIds: string[];
  removedMediaTargets: string[];
  removedEmbeddingTargets: string[];
  staleObjectCount: number;
  isClean: boolean;
};

export type DocxSectionContract = {
  id: string;
  title: string;
  required: boolean;
  targetChars: number;
  contentTypes: Array<"paragraph" | "list" | "table" | "placeholder">;
  fallbackText: string;
  renderMode?:
    | "plainParagraph"
    | "termsTable"
    | "featureBlock"
    | "functionCatalogTable"
    | "simpleFallbackSection"
    | "dataRequirementSection";
  bodyStyleId?: string;
};

export type DocxTemplateProfile = {
  id: string;
  name: string;
  legacyTerms: string[];
  sectionContracts: DocxSectionContract[];
  featureBlock: {
    targetChars: number;
    processTargetChars: number;
    detailTargetChars: number;
    ruleTargetChars: number;
    inputCapacity: number;
    outputCapacity: number;
    fallbackText: string;
  };
};

export type DocxQualitySectionMetric = {
  sectionId: string;
  title: string;
  targetChars: number;
  actualChars: number;
  ratio: number;
  required: boolean;
  usedFallback: boolean;
  withinRange: boolean;
};

export type DocxQualityTableMetric = {
  tableId: string;
  title: string;
  expectedRows: number;
  renderedRows: number;
  capacityRows: number;
  completionRatio: number;
};

export type DocxQualityReport = {
  profileId: string;
  structureCoverageRatio: number;
  requiredSectionCount: number;
  coveredSectionCount: number;
  featureBlockCount: number;
  expectedFeatureBlockCount: number;
  sectionMetrics: DocxQualitySectionMetric[];
  tableMetrics: DocxQualityTableMetric[];
  placeholderResidualCount: number;
  legacyContentHits: Array<{ term: string; count: number }>;
  relationIntegrity: DocxRelationIntegrity;
};

type DocxSectionValue = {
  id: string;
  title: string;
  placeholder: string;
  content: string;
  targetChars: number;
  usedFallback: boolean;
  required: boolean;
};

type DocxFeatureRecord = {
  name: string;
  type: string;
  required: string;
  enumValues: string;
  note: string;
};

type DocxTermRecord = {
  term: string;
  definition: string;
};

type DocxFunctionCatalogRecord = {
  sequence: string;
  module: string;
  name: string;
  note: string;
};

type DocxFeatureBlockModel = {
  index: number;
  name: string;
  code: string;
  processItems: string[];
  detailItems: string[];
  ruleItems: string[];
  inputRecords: DocxFeatureRecord[];
  outputRecords: DocxFeatureRecord[];
  targetChars: number;
  usedFallback: boolean;
};

type DocxTemplateBuildResult = {
  profile: DocxTemplateProfile;
  placeholderValues: Record<string, string>;
  sectionValues: DocxSectionValue[];
  featureBlocks: DocxFeatureBlockModel[];
  termRecords: DocxTermRecord[];
  functionCatalogRecords: DocxFunctionCatalogRecord[];
  departmentRecords: Array<{ department: string; duty: string }>;
  tableMetrics: DocxQualityTableMetric[];
};

type DocxBodyBlock = {
  type: "paragraph" | "table" | "section";
  xml: string;
  text: string;
};

const PAGE_BREAK = '<div style="page-break-after: always;"></div>';
const DOCX_MIN_RATIO = 0.7;
const DOCX_MAX_RATIO = 1;
const FEATURE_BLOCK_START_ANCHOR = "业务功能一：{{功能名称1}}";
const FEATURE_BLOCK_END_ANCHOR = "特色系统需求";
const DEPARTMENT_ROW_ANCHOR = "{{部门1}}";
const FUNCTION_CATALOG_ROW_ANCHOR = "{{功能模块1}}";

const BASE_DOCX_STYLES = {
  normal: "1",
  bodyFirstIndent: "2",
  body: "3",
  heading1: "4",
  heading2: "5",
  heading3: "6",
  bodyIndent: "7",
  heading4: "8",
  heading5: "9",
} as const;

const BODY_STYLE_ID = BASE_DOCX_STYLES.body;
const HEADING_STYLE_IDS = [
  BASE_DOCX_STYLES.heading1,
  BASE_DOCX_STYLES.heading2,
  BASE_DOCX_STYLES.heading3,
  BASE_DOCX_STYLES.heading4,
  BASE_DOCX_STYLES.heading5,
] as const;
const SECTION_HEADING_STYLE_IDS = [
  BASE_DOCX_STYLES.heading2,
  BASE_DOCX_STYLES.heading3,
  BASE_DOCX_STYLES.heading4,
] as const;

const USER_REQUIREMENTS_BASE_PROFILE: DocxTemplateProfile = {
  id: "user-requirements-base-v1",
  name: "User Requirements Base High Fidelity",
  legacyTerms: [
    "注意：此项必填",
    "注意：仅涉及到使用并不涉及商务采购的也算使用",
    "数据流向如下流程图",
    "零售水晶球",
    "新增代发管理",
    "非标准化代发",
    "非标代发",
    "零售集市",
  ],
  sectionContracts: [
    {
      id: "1.1",
      title: "需求背景",
      required: true,
      targetChars: 180,
      contentTypes: ["paragraph"],
      fallbackText: "结合当前业务现状与痛点，需启动本期建设，以形成统一、可追溯、可配置的业务支撑能力。",
    },
    {
      id: "1.2",
      title: "业务目标",
      required: true,
      targetChars: 120,
      contentTypes: ["paragraph"],
      fallbackText: "本期目标为沉淀标准化业务规则、提升处理效率并降低执行偏差。",
    },
    {
      id: "1.3",
      title: "业务价值",
      required: true,
      targetChars: 160,
      contentTypes: ["paragraph"],
      fallbackText: "通过统一入口、统一规则和统一口径，提升业务效率、降低操作风险，并为后续分析与集成提供基础。",
    },
    {
      id: "1.4",
      title: "术语",
      required: true,
      targetChars: 120,
      contentTypes: ["paragraph"],
      fallbackText: "本节用于统一关键术语、业务口径和角色定义，避免跨部门理解偏差。",
      renderMode: "termsTable",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "2.1",
      title: "业务概述",
      required: true,
      targetChars: 220,
      contentTypes: ["paragraph"],
      fallbackText: "本节概述业务参与方、适用范围、典型场景与整体运行方式，为后续功能说明提供上下文。",
    },
    {
      id: "2.2",
      title: "业务处理流程",
      required: true,
      targetChars: 220,
      contentTypes: ["paragraph"],
      fallbackText: "流程图占位：整体业务处理流程，后续接入渲染。",
      renderMode: "plainParagraph",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "2.3.1",
      title: "我行及同业现状",
      required: true,
      targetChars: 150,
      contentTypes: ["paragraph"],
      fallbackText: "当前行业普遍通过系统化、规则化方式提升业务处理一致性，但在跨系统协同、实时反馈与精细化控制方面仍存在提升空间。",
    },
    {
      id: "2.3.2",
      title: "我行存在的问题",
      required: true,
      targetChars: 150,
      contentTypes: ["paragraph"],
      fallbackText: "现有业务处理中仍存在流程割裂、人工判断较多、数据口径不统一与追溯难度较高等问题，需要通过本期建设统一治理。",
    },
    {
      id: "2.4",
      title: "项目参与部门及职责",
      required: true,
      targetChars: 120,
      contentTypes: ["table"],
      fallbackText: "本节用于明确业务、产品、技术、运营及管理相关参与方的职责边界。",
    },
    {
      id: "3.1",
      title: "功能分类",
      required: true,
      targetChars: 100,
      contentTypes: ["list", "table"],
      fallbackText: "本节用于汇总本期功能模块、功能名称和备注信息，形成标准功能清单。",
      renderMode: "functionCatalogTable",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.1",
      title: "支付系统",
      required: false,
      targetChars: 80,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.2",
      title: "回单系统",
      required: false,
      targetChars: 60,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.3",
      title: "报表",
      required: false,
      targetChars: 100,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.4",
      title: "询证函需求",
      required: false,
      targetChars: 80,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.5",
      title: "京智柜面需求",
      required: false,
      targetChars: 80,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.6",
      title: "核算引擎核算规则配置表",
      required: false,
      targetChars: 80,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.7",
      title: "对手信息",
      required: false,
      targetChars: 80,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.8",
      title: "通知类业务",
      required: false,
      targetChars: 80,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "3.3.9",
      title: "联网核查系统",
      required: false,
      targetChars: 80,
      contentTypes: ["placeholder"],
      fallbackText: "本期不涉及，预留后续接入。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.1",
      title: "是否涉及使用外部数据",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认不涉及新增外部数据接入，现阶段以行内数据为主开展建设；如后续引入外部数据，将补充审核编号、使用范围、来源合规性和审批记录。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.2",
      title: "外部数据是否含有与客户有关的信息",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认不涉及新增客户相关外部数据；如后续引入涉及客户信息的数据，将同步补充客户授权方式、授权留痕要求以及无需授权的合规依据。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.3",
      title: "是否涉及监管报送",
      required: true,
      targetChars: 110,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认不直接影响监管报送口径；如后续联动监管报送系统或影响报送字段、报文和规则口径，将补充涉及系统、字段范围和逻辑调整方案。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.4",
      title: "是否落实数据分级分类管控要求",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期按现行数据分级分类制度执行，在需求、设计、开发、测试和投产阶段同步落实访问控制、最小必要、日志留痕和风险审计要求。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.5",
      title: "数据挖掘分析需求",
      required: false,
      targetChars: 100,
      contentTypes: ["placeholder"],
      fallbackText: "本期暂不新增专项数据挖掘分析需求；如后续引入指标加工、标签计算或专题分析能力，将补充分析目标、数据口径和输出形式。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.6",
      title: "是否差异化设置 “最小必要”数据权限",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期按岗位职责和业务边界差异化配置数据权限，默认遵循“最小必要”原则；若存在统一权限场景，将在详细设计中补充原因说明和风险缓释措施。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.7",
      title: "是否涉及数据对外提供",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认不涉及数据对外提供；如后续存在行外传输、共享或外部查询场景，需先完成内部审批并补充对外提供范围、对象、方式和安全控制要求。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.8",
      title: "是否涉及处理3级及以上数据",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认按照数据分类分级管理制度开展识别与评估，当前未新增明确的3级及以上数据处理场景；如后续涉及高敏级数据，将逐项补充字段范围与控制要求。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.9",
      title: "是否涉及以下数据处理场景（多选）",
      required: true,
      targetChars: 110,
      contentTypes: ["paragraph"],
      fallbackText: "当前未新增需要单独审批的敏感数据处理场景；如后续涉及个人客户数据采集、批量查询展示、批量导出或向行外第三方传输数据，需同步补充身份认证、脱敏、下载限制和风险缓释措施。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.10",
      title: "是否涉及数据安全影响评估",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认不单独触发数据安全影响评估；如后续新增高等级数据处理、新建系统或重大功能改造场景，将在上线前完成影响评估并附评估结论。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.11",
      title: "是否明确数据最短存储时间",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期数据存储周期按照业务场景、合规要求和现网制度执行，默认明确最短存储时间并避免超期保留；如后续存在特殊存储场景，将补充具体保留期限和风险控制。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.12",
      title: "是否明确数据备份与恢复要求",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期沿用现网数据备份与恢复基线，覆盖备份范围、备份频率、存储位置、恢复时间目标和恢复点目标，确保故障场景下关键数据可恢复。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.13",
      title: "是否明确数据操作日志记录要求",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认对查询、导出、配置变更和敏感操作全量留痕，日志覆盖操作人员、时间、终端标识、操作对象和处理结果，并满足审计追溯要求。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.14",
      title: "是否明确数据安全风险监测范围与要求",
      required: true,
      targetChars: 100,
      contentTypes: ["paragraph"],
      fallbackText: "本期将风险监测纳入系统运行基线，覆盖访问异常、批量操作、敏感字段使用、导出传输和权限变更等重点场景，并结合告警机制进行持续监测。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "4.15",
      title: "是否审查模型开发加工目的与收集目的一致性",
      required: true,
      targetChars: 110,
      contentTypes: ["paragraph"],
      fallbackText: "本期默认遵循数据收集目的与加工目的保持一致的原则；如后续引入模型、算法或标签加工能力，将补充用途审查结论、伦理合规判断和审查留痕材料。",
      renderMode: "dataRequirementSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "5.1",
      title: "非功能性需求",
      required: true,
      targetChars: 220,
      contentTypes: ["paragraph"],
      fallbackText: "本期非功能需求按企业生产基线执行，需满足核心链路稳定性、关键接口性能、安全访问控制、审计留痕、异常告警和兼容性要求，确保高峰时段稳定可用并支持问题追踪。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
    {
      id: "5.2",
      title: "系统需求",
      required: true,
      targetChars: 220,
      contentTypes: ["paragraph"],
      fallbackText: "本期系统需求沿用现网部署与运维基线，需明确依赖系统、接口调用方式、监控告警覆盖范围、日志方案、任务调度策略和灾备恢复要求，保证上线后具备可观测和可运维能力。",
      renderMode: "simpleFallbackSection",
      bodyStyleId: BODY_STYLE_ID,
    },
  ],
  featureBlock: {
    targetChars: 560,
    processTargetChars: 520,
    detailTargetChars: 180,
    ruleTargetChars: 640,
    inputCapacity: 15,
    outputCapacity: 18,
    fallbackText: "本期不涉及，预留后续接入。",
  },
};

export function resolveDocxTemplateProfile(templateProfileId?: string): DocxTemplateProfile {
  const resolvedId = templateProfileId?.trim() || USER_REQUIREMENTS_BASE_PROFILE.id;
  if (resolvedId === USER_REQUIREMENTS_BASE_PROFILE.id) {
    return USER_REQUIREMENTS_BASE_PROFILE;
  }

  throw new Error(`Unknown DOCX template profile: ${resolvedId}`);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function polishGeneratedText(value: string) {
  return normalizeWhitespace(value)
    .replace(/\s*([，。；：！？、])\s*/g, "$1")
    .replace(/([。！？；])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/([（【《“‘])\s+/g, "$1")
    .replace(/\s+([）】》”’])/g, "$1")
    .replace(/；{2,}/g, "；")
    .replace(/。；/g, "。")
    .replace(/；。/g, "。")
    .replace(/[；，,]\s*$/g, "")
    .trim();
}

function countVisibleChars(value: string) {
  return value.replace(/\s+/g, "").length;
}

function countPlaceholderResiduals(value: string) {
  return (value.match(/\{\{[^{}]+\}\}/g) ?? []).length;
}

function toRatio(actual: number, target: number) {
  if (!target) return 1;
  return Number((actual / target).toFixed(2));
}

function isRatioWithinRange(ratio: number, required: boolean, usedFallback: boolean) {
  if (!required && usedFallback) return true;
  return ratio >= DOCX_MIN_RATIO && ratio <= DOCX_MAX_RATIO;
}

function trimToChars(value: string, maxChars: number) {
  if (countVisibleChars(value) <= maxChars) return value;

  let result = "";
  for (const segment of value.split(/(?<=[。！？；])/)) {
    const next = normalizeWhitespace(`${result} ${segment}`);
    if (countVisibleChars(next) > maxChars) break;
    result = next;
  }

  if (result) return result;

  let plain = "";
  for (const char of value) {
    const next = `${plain}${char}`;
    if (countVisibleChars(next) > maxChars) break;
    plain = next;
  }
  return plain.trim();
}

function fitContentToBudget(value: string, targetChars: number, fallback: string) {
  const fallbackValue = fallback.trim();
  const normalized = normalizeWhitespace(value) || fallbackValue;
  return trimToChars(normalized, targetChars);
}

function toSentenceList(value: string) {
  return value
    .split(/[；。!?！？\n]/)
    .map((item) => normalizeWhitespace(item))
    .filter(Boolean);
}

function joinListAsParagraph(items: string[]) {
  return items.map((item) => normalizeWhitespace(item)).filter(Boolean).join("；");
}

function uniqueNonEmpty(values: string[]) {
  return uniqueValues(values.map((value) => normalizeWhitespace(value)).filter(Boolean));
}

function safePlaceholderText(value: string) {
  return value.replace(/\{\{[^{}]+\}\}/g, "").trim();
}

function buildFlowchartPlaceholder(value: string, purpose: string) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return `流程图占位：${purpose}，后续接入渲染。`;
  }
  return `流程图占位：${purpose}，后续接入渲染。${normalized}`;
}

function cleanLegacyText(value: string, legacyTerms = USER_REQUIREMENTS_BASE_PROFILE.legacyTerms) {
  let result = value;
  for (const term of legacyTerms) {
    result = result.split(term).join("");
  }
  return polishGeneratedText(result);
}

function toChineseFeatureLabel(index: number) {
  const numerals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (index <= numerals.length) return numerals[index - 1] ?? `${index}`;
  return `${index}`;
}

function findSectionContract(profile: DocxTemplateProfile, id: string) {
  const contract = profile.sectionContracts.find((item) => item.id === id);
  if (!contract) {
    throw new Error(`Missing DOCX section contract: ${id}`);
  }
  return contract;
}

function scanLegacyHits(value: string, legacyTerms = USER_REQUIREMENTS_BASE_PROFILE.legacyTerms) {
  return legacyTerms
    .map((term) => ({ term, count: value.split(term).length - 1 }))
    .filter((item) => item.count > 0);
}

function escapeXmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractXmlText(xml: string) {
  return normalizeWhitespace(
    decodeXmlEntities(
      xml
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<w:br\/>/g, "\n")
        .replace(/<w:cr\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function parseStyleSummaries(stylesXml: string) {
  const summaries: DocxStyleSummary[] = [];

  for (const match of stylesXml.matchAll(
    /<w:style\b[^>]*w:styleId="([^"]+)"[\s\S]*?<w:name\b[^>]*w:val="([^"]+)"/g,
  )) {
    summaries.push({
      styleId: match[1] ?? "",
      name: decodeXmlEntities(match[2] ?? ""),
    });
  }

  return summaries;
}

function inferHeadingLevel(styleName: string | undefined, text: string) {
  const normalizedStyle = styleName?.toLowerCase() ?? "";
  const normalizedText = text.trim();

  const headingMatch = normalizedStyle.match(/heading\s*(\d+)/);
  if (headingMatch) {
    return Number.parseInt(headingMatch[1] ?? "0", 10) || undefined;
  }

  const zhHeadingMatch = normalizedStyle.match(/标题\s*(\d+)/);
  if (zhHeadingMatch) {
    return Number.parseInt(zhHeadingMatch[1] ?? "0", 10) || undefined;
  }

  if (/^第[0-9一二三四五六七八九十]+章/.test(normalizedText)) {
    return 1;
  }

  if (/^\d+\.\d+(\.\d+)*\s*/.test(normalizedText)) {
    return normalizedText.split(".").length;
  }

  return undefined;
}

function buildTocHtml(outline: Array<{ level: number; text: string }>) {
  if (outline.length === 0) {
    return `
      <section class="req-section">
        <h1>目录</h1>
        <p class="req-empty">正文未提供可生成目录的标题。</p>
      </section>
    `;
  }

  const items = outline
    .filter((item) => item.level <= 3)
    .map((item) => {
      const indent = Math.max(0, item.level - 1) * 24;
      return `
        <li class="req-toc-item" style="padding-left:${indent}px;">
          <span class="req-toc-text">${escapeHtml(item.text)}</span>
          <span class="req-toc-dots"></span>
        </li>
      `;
    })
    .join("");

  return `
    <section class="req-section">
      <h1>目录</h1>
      <ol class="req-toc-list">
        ${items}
      </ol>
    </section>
  `;
}

function buildCoverHtml({
  title,
  organization,
  author,
  version,
  docDate,
}: {
  title: string;
  organization?: string;
  author?: string;
  version?: string;
  docDate?: string;
}) {
  return `
    <section class="req-cover">
      <div class="req-cover-spacer"></div>
      <h1 class="req-cover-title">${escapeHtml(title)}</h1>
      <div class="req-cover-meta">
        <p><strong>制作单位：</strong>${escapeHtml(organization ?? "（部门）")}</p>
        <p><strong>文档版本号：</strong>${escapeHtml(version ?? "V1.0")}</p>
        <p><strong>日期：</strong>${escapeHtml(docDate ?? formatDocDate())}</p>
        <p><strong>编写人员：</strong>${escapeHtml(author ?? "ReqAgent")}</p>
      </div>
    </section>
  `;
}

function buildChangeLogHtml(version: string, docDate: string) {
  return `
    <section class="req-section">
      <h1>文档更改记录表</h1>
      <table>
        <thead>
          <tr>
            <th>更改号</th>
            <th>日期</th>
            <th>图号/表号/段落号</th>
            <th>A/M/D</th>
            <th>题目或简短描述</th>
            <th>更改申请号</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escapeHtml(version)}</td>
            <td>${escapeHtml(docDate)}</td>
            <td>全文</td>
            <td>A</td>
            <td>初稿生成</td>
            <td>ReqAgent</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

export function formatDocDate(input = new Date()) {
  const year = input.getFullYear();
  const month = `${input.getMonth() + 1}`.padStart(2, "0");
  const day = `${input.getDate()}`.padStart(2, "0");
  return `${year}/${month}/${day}`;
}

export async function analyzeDocxStructure(docxPath: string): Promise<DocxStructureAnalysis> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reqagent-docx-analyze-"));

  try {
    await execa("unzip", ["-q", docxPath, "-d", tempDir]);
    const [documentXml, stylesXml] = await Promise.all([
      fs.readFile(path.join(tempDir, "word", "document.xml"), "utf8"),
      fs.readFile(path.join(tempDir, "word", "styles.xml"), "utf8").catch(() => ""),
    ]);

    if (!documentXml) {
      throw new Error("Failed to read word/document.xml from DOCX");
    }

    const styles = parseStyleSummaries(stylesXml);
    const styleNameById = new Map(styles.map((style) => [style.styleId, style.name]));

    const headings: DocxHeadingSummary[] = [];
    const textParts: string[] = [];
    const paragraphTexts: Array<{ index: number; text: string }> = [];
    let paragraphCount = 0;

    for (const match of documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
      paragraphCount += 1;
      const paragraphXml = match[0] ?? "";
      const text = extractXmlText(paragraphXml);
      if (!text) continue;

      paragraphTexts.push({ index: paragraphCount, text });
      textParts.push(text);
      const styleId = paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1];
      const styleName = styleId ? styleNameById.get(styleId) : undefined;
      const level = inferHeadingLevel(styleName, text);

      if (level) {
        headings.push({
          level,
          text,
          styleId,
          styleName,
          paragraphIndex: paragraphCount,
        });
      }
    }

    const tables: DocxTableSummary[] = [];
    let tableIndex = 0;

    for (const match of documentXml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)) {
      tableIndex += 1;
      const tableXml = match[0] ?? "";
      const rows = [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rowMatch) => {
        const rowXml = rowMatch[0] ?? "";
        return [...rowXml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cellMatch) =>
          extractXmlText(cellMatch[0] ?? ""),
        );
      });

      const rowCount = rows.length;
      const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

      tables.push({
        index: tableIndex,
        rowCount,
        columnCount,
        previewRows: rows
          .slice(0, 4)
          .map((row) => row.map((cell) => cell.slice(0, 80))),
      });
    }

    const sectionCharCounts = headings
      .filter((heading) => !heading.text.includes("PAGEREF"))
      .map((heading, index) => {
        const nextHeadingParagraph = headings[index + 1]?.paragraphIndex ?? Number.POSITIVE_INFINITY;
        const content = paragraphTexts
          .filter(
            (paragraph) =>
              paragraph.index > heading.paragraphIndex &&
              paragraph.index < nextHeadingParagraph &&
              !paragraph.text.includes("PAGEREF"),
          )
          .map((paragraph) => paragraph.text)
          .join("\n");

        return {
          heading: heading.text,
          chars: countVisibleChars(content),
        };
      });

    const textContent = textParts.join("\n");
    const title =
      headings.find((heading) => heading.level === 1)?.text ||
      textParts.find((text) => text.length > 0)?.slice(0, 120) ||
      path.basename(docxPath, path.extname(docxPath));
    const relationIntegrity = await verifyDocxPackageRelations(tempDir, documentXml);
    const legacyContentHits = scanLegacyHits(textContent);

    return {
      title,
      headings,
      tables,
      styles: styles.slice(0, 32),
      hasToc: /TOC\s+\\o/.test(documentXml) || styles.some((style) => /^toc /i.test(style.name)),
      sectionCount: Math.max(1, documentXml.split("<w:sectPr").length - 1),
      paragraphCount,
      tableCount: tables.length,
      charCount: textContent.length,
      textContent,
      sectionCharCounts,
      relationIntegrity,
      legacyContentHits,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function buildDocxStructureMarkdown(fileName: string, analysis: DocxStructureAnalysis) {
  const headingLines =
    analysis.headings.length > 0
      ? analysis.headings
          .slice(0, 48)
          .map((heading) => `${"  ".repeat(Math.max(0, heading.level - 1))}- ${heading.text}`)
          .join("\n")
      : "- 未识别到标题层级";

  const styleLines =
    analysis.styles.length > 0
      ? analysis.styles
          .slice(0, 16)
          .map((style) => `- ${style.styleId}: ${style.name}`)
          .join("\n")
      : "- 未识别到样式";

  const tableSections = analysis.tables
    .slice(0, 4)
    .map((table) => {
      const rows = table.previewRows
        .map((row) =>
          row.length > 0
            ? `| ${row.map((cell) => cell || " ").join(" | ")} |`
            : "| |",
        )
        .join("\n");

      return [
        `### 表格 ${table.index}`,
        "",
        `- 行数: ${table.rowCount}`,
        `- 列数: ${table.columnCount}`,
        "",
        rows || "_无预览_",
      ].join("\n");
    })
    .join("\n\n");

  return [
    `# 模板结构: ${fileName}`,
    "",
    `- 标题: ${analysis.title}`,
    `- 字符数: ${analysis.charCount}`,
    `- 段落数: ${analysis.paragraphCount}`,
    `- 表格数: ${analysis.tableCount}`,
    `- 分节数: ${analysis.sectionCount}`,
    `- 目录: ${analysis.hasToc ? "存在" : "未检测到"}`,
    "",
    "## 章节树",
    headingLines,
    "",
    "## 样式摘要",
    styleLines,
    "",
    "## 文本预览",
    "",
    analysis.textContent.slice(0, 3000),
    "",
    tableSections ? "## 表格预览" : "",
    tableSections,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadMarkdownExportSource(input: {
  content?: string;
  sourcePath?: string;
  workspaceDir: string;
}) {
  let markdown = input.content?.trim() ?? "";
  let resolvedSourcePath: string | undefined;

  if (!markdown && input.sourcePath) {
    const resolved = resolveWorkspacePath(input.workspaceDir, input.sourcePath);
    if (!resolved) {
      throw new Error("Access denied: sourcePath outside workspace");
    }
    markdown = (await fs.readFile(resolved, "utf8")).trim();
    resolvedSourcePath = path.relative(input.workspaceDir, resolved).replace(/\\/g, "/");
  }

  if (!markdown) {
    throw new Error("export_docx requires either `content` or `sourcePath`");
  }

  const outline = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length ?? 1,
    text: normalizeWhitespace(match[2] ?? ""),
  }));

  const title =
    outline.find((item) => item.level === 1)?.text ||
    markdown.match(/^(.+)$/m)?.[1]?.trim() ||
    "需求说明书";

  return {
    markdown,
    sourcePath: resolvedSourcePath,
    title,
    outline,
  } satisfies DocxExportSource;
}

function stripLeadingTitleHeading(markdown: string) {
  return markdown.replace(/^#\s+.+?(?:\r?\n){1,2}/, "");
}

export async function renderRequirementsDocHtml(options: RenderRequirementsDocHtmlOptions) {
  const version = options.version?.trim() || "V1.0";
  const docDate = options.docDate?.trim() || formatDocDate();
  const outline = [...options.markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((match) => ({
    level: match[1]?.length ?? 1,
    text: normalizeWhitespace(match[2] ?? ""),
  }));
  const markdownBody = stripLeadingTitleHeading(options.markdown);
  const bodyHtml = await marked.parse(markdownBody, { async: false, gfm: true });

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    @page {
      margin: 2.54cm 3.18cm 2.54cm 3.18cm;
    }
    body {
      font-family: "Songti SC", "STSong", "SimSun", serif;
      color: #111827;
      line-height: 1.8;
      font-size: 12pt;
      margin: 0;
    }
    h1, h2, h3, h4 {
      font-family: "Heiti SC", "STHeiti", "SimHei", sans-serif;
      margin: 0 0 12pt;
      color: #0f172a;
    }
    h1 {
      font-size: 18pt;
      page-break-after: avoid;
      margin-top: 24pt;
    }
    h2 {
      font-size: 15pt;
      margin-top: 18pt;
    }
    h3 {
      font-size: 13pt;
      margin-top: 14pt;
    }
    p, li {
      margin: 0 0 8pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0 18pt;
      font-size: 10.5pt;
    }
    th, td {
      border: 1px solid #111827;
      padding: 6pt 8pt;
      vertical-align: top;
    }
    th {
      background: #e5edf7;
      font-family: "Heiti SC", "STHeiti", "SimHei", sans-serif;
    }
    blockquote {
      margin: 10pt 0;
      padding: 8pt 12pt;
      color: #334155;
      border-left: 3pt solid #94a3b8;
      background: #f8fafc;
    }
    code {
      font-family: "Menlo", "Monaco", monospace;
      font-size: 10pt;
      background: #f3f4f6;
      padding: 1pt 3pt;
      border-radius: 3pt;
    }
    pre {
      background: #f3f4f6;
      padding: 10pt;
      border-radius: 4pt;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .req-cover {
      min-height: 23cm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .req-cover-spacer {
      flex: 1;
    }
    .req-cover-title {
      font-size: 24pt;
      line-height: 1.4;
      margin-bottom: 32pt;
      max-width: 85%;
    }
    .req-cover-meta {
      width: 80%;
      margin: 0 auto 20pt;
      text-align: left;
      font-size: 12pt;
    }
    .req-cover-meta p {
      margin-bottom: 8pt;
    }
    .req-section {
      margin: 0;
    }
    .req-toc-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .req-toc-item {
      display: flex;
      align-items: baseline;
      gap: 8pt;
      margin-bottom: 6pt;
    }
    .req-toc-text {
      white-space: nowrap;
    }
    .req-toc-dots {
      flex: 1;
      border-bottom: 1px dotted #64748b;
      transform: translateY(-3pt);
    }
    .req-empty {
      color: #64748b;
    }
  </style>
</head>
<body>
  ${buildCoverHtml({
    title: options.title,
    organization: options.organization,
    author: options.author,
    version,
    docDate,
  })}
  ${PAGE_BREAK}
  ${buildChangeLogHtml(version, docDate)}
  ${PAGE_BREAK}
  ${options.includeToc === false ? "" : `${buildTocHtml(outline)}${PAGE_BREAK}`}
  <section class="req-section">
    ${bodyHtml}
  </section>
</body>
</html>`;
}

type MarkdownSection = {
  heading: string;
  normalizedHeading: string;
  level: number;
  index: number;
  body: string;
};

type LabeledBlock = {
  label: string;
  normalizedLabel: string;
  body: string;
};

function normalizeHeadingLabel(value: string) {
  return normalizeWhitespace(
    value
      .replace(/^第[0-9一二三四五六七八九十]+章\s*/, "")
      .replace(/^\d+(?:\.\d+)*\s*/, "")
      .replace(/[（(]\s*(?:FR|SR)[-_ ]?\d+\s*[）)]/gi, "")
      .trim(),
  );
}

function normalizeMatchKey(value: string) {
  return normalizeHeadingLabel(value)
    .replace(/[【】[\]()（）]/g, " ")
    .replace(/[：:·、,，/]/g, " ")
    .replace(/\b(?:fr|sr)\s*-?\s*\d+\b/gi, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseMarkdownSections(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.push({
      heading: currentHeading,
      normalizedHeading: normalizeHeadingLabel(currentHeading),
      level: currentLevel,
      index: sections.length,
      body: currentBody.join("\n").trim(),
    });
  };

  let currentLevel = 1;

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      currentLevel = match[1]?.length ?? 1;
      currentHeading = match[2]?.trim() ?? "";
      currentBody = [];
      continue;
    }
    currentBody.push(line);
  }

  flush();
  return sections;
}

function getSectionBodyByCandidates(
  sections: MarkdownSection[],
  candidates: string[],
) {
  const section = findSectionByCandidates(sections, candidates);
  if (!section) return "";
  if (section.body.trim()) return section.body;
  // Body is empty — the content lives in child sections (e.g. `## 业务概述` → `### 业务概述`).
  // Merge descendant bodies so the caller gets the actual content.
  const descendants = getDescendantSections(sections, section);
  return descendants
    .map((d) => d.body)
    .filter(Boolean)
    .join("\n");
}

function markdownLinesToPlainText(value: string) {
  return polishGeneratedText(
    value
    .replace(/```mermaid([\s\S]*?)```/gi, (_match, content: string) => {
      const steps = [...content.matchAll(/\[([^\]]+)\]/g)]
        .map((entry) => normalizeWhitespace(entry[1] ?? ""))
        .filter(Boolean);
      return steps.join(" -> ");
    })
    .replace(/```[\s\S]*?```/g, "")
    .split(/\r?\n/)
    .map((line) =>
      normalizeWhitespace(
        line
          .replace(/^>\s?/, "")
          .replace(/^-\s+\[[ xX]\]\s+/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, "")
          .replace(/^\|\s*/, "")
          .replace(/\s*\|$/g, "")
          .replace(/\s*\|\s*/g, " / ")
          .replace(/[*_`]/g, "")
          .replace(/!\[[^\]]*]\([^)]+\)/g, "")
          .replace(/\[([^\]]+)]\([^)]+\)/g, "$1"),
      ),
    )
    .filter(Boolean)
    .join("；"),
  );
}

function parseMarkdownList(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+|^\d+\.\s+|^-\s+\[[ xX]\]\s+/.test(line))
    .map((line) =>
      normalizeWhitespace(
        line
          .replace(/^-\s+\[[ xX]\]\s+/, "")
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, ""),
      ),
    );
}

function parseMarkdownTable(body: string) {
  const tableLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));

  if (tableLines.length < 2) return [];

  const rows = tableLines
    .filter((line) => !/^\|(?:\s*:?-+:?\s*\|)+$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => normalizeWhitespace(cell)),
    );

  if (rows.length < 2) return [];
  return rows;
}

function getBodyTextByCandidates(
  sections: MarkdownSection[],
  candidates: string[],
) {
  return markdownLinesToPlainText(getSectionBodyByCandidates(sections, candidates));
}

function findSectionByCandidatesStrict(
  sections: MarkdownSection[],
  candidates: string[],
) {
  let bestMatch: MarkdownSection | undefined;
  let bestScore = -1;

  for (const section of sections) {
    const sectionLabel = section.normalizedHeading;
    const sectionKey = normalizeMatchKey(section.heading);

    for (const candidate of candidates) {
      const candidateLabel = normalizeHeadingLabel(candidate);
      const candidateKey = normalizeMatchKey(candidate);
      if (!candidateKey) continue;

      let score = -1;
      if (sectionLabel === candidateLabel) {
        score = 6;
      } else if (sectionKey === candidateKey) {
        score = 5;
      }

      const tieBreak =
        score >= 0 &&
        score === bestScore &&
        !bestMatch?.body?.trim() &&
        section.body.trim();
      if (score > bestScore || tieBreak) {
        bestScore = score;
        bestMatch = section;
      }
    }
  }

  return bestMatch;
}

function getSectionBodyByCandidatesStrict(
  sections: MarkdownSection[],
  candidates: string[],
) {
  const section = findSectionByCandidatesStrict(sections, candidates);
  if (!section) return "";
  if (section.body.trim()) return section.body;
  const descendants = getDescendantSections(sections, section);
  return descendants
    .map((d) => d.body)
    .filter(Boolean)
    .join("\n");
}

function getBodyTextByCandidatesStrict(
  sections: MarkdownSection[],
  candidates: string[],
) {
  return markdownLinesToPlainText(getSectionBodyByCandidatesStrict(sections, candidates));
}

function assignSequence(
  target: Record<string, string>,
  prefix: string,
  values: string[],
  limit: number,
) {
  for (let index = 0; index < limit; index += 1) {
    const value = values[index]?.trim();
    if (value) {
      target[`${prefix}${index + 1}`] = value;
    }
  }
}

function findSectionByCandidates(
  sections: MarkdownSection[],
  candidates: string[],
) {
  let bestMatch: MarkdownSection | undefined;
  let bestScore = -1;

  for (const section of sections) {
    const sectionLabel = section.normalizedHeading;
    const sectionKey = normalizeMatchKey(section.heading);

    for (const candidate of candidates) {
      const candidateLabel = normalizeHeadingLabel(candidate);
      const candidateKey = normalizeMatchKey(candidate);
      if (!candidateKey) continue;

      let score = -1;
      if (sectionLabel === candidateLabel) {
        score = 6;
      } else if (sectionKey === candidateKey) {
        score = 5;
      } else if (sectionKey.includes(candidateKey) || candidateKey.includes(sectionKey)) {
        score = 4;
      } else if (
        sectionLabel.includes(candidateLabel) ||
        candidateLabel.includes(sectionLabel)
      ) {
        score = 3;
      }

      // Prefer sections with non-empty body when scores are tied.
      // This prevents matching an empty parent heading (e.g. `## 业务概述`)
      // when a child heading with the same name has actual content.
      const tieBreak =
        score >= 0 &&
        score === bestScore &&
        !bestMatch?.body?.trim() &&
        section.body.trim();
      if (score > bestScore || tieBreak) {
        bestScore = score;
        bestMatch = section;
      }
    }
  }

  return bestMatch;
}

function getDescendantSections(
  sections: MarkdownSection[],
  parent: MarkdownSection,
) {
  const descendants: MarkdownSection[] = [];

  for (let index = parent.index + 1; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section) break;
    if (section.level <= parent.level) break;
    descendants.push(section);
  }

  return descendants;
}

function parseLabeledBlocks(body: string) {
  const lines = body.split(/\r?\n/);
  const blocks: LabeledBlock[] = [];
  let currentLabel = "";
  let currentBody: string[] = [];

  const flush = () => {
    if (!currentLabel) return;
    blocks.push({
      label: currentLabel,
      normalizedLabel: normalizeHeadingLabel(currentLabel),
      body: currentBody.join("\n").trim(),
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = line.match(/^\*\*([^*]+?)\*\*[:：]?\s*(.*)$/);

    if (match) {
      flush();
      currentLabel = match[1]?.trim() ?? "";
      currentBody = [];
      if (match[2]?.trim()) {
        currentBody.push(match[2].trim());
      }
      continue;
    }

    if (currentLabel) {
      currentBody.push(rawLine);
    }
  }

  flush();
  return blocks;
}

function findLabeledBlock(
  blocks: LabeledBlock[],
  candidates: string[],
) {
  let bestMatch: LabeledBlock | undefined;
  let bestScore = -1;

  for (const block of blocks) {
    const blockKey = normalizeMatchKey(block.label);

    for (const candidate of candidates) {
      const candidateLabel = normalizeHeadingLabel(candidate);
      const candidateKey = normalizeMatchKey(candidate);
      if (!candidateKey) continue;

      let score = -1;
      if (block.normalizedLabel === candidateLabel) {
        score = 6;
      } else if (blockKey === candidateKey) {
        score = 5;
      } else if (blockKey.includes(candidateKey) || candidateKey.includes(blockKey)) {
        score = 4;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = block;
      }
    }
  }

  return bestMatch;
}

function uniqueValues(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeMatchKey(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }

  return result;
}

function parsePlainItems(body: string) {
  return uniqueValues(
    markdownLinesToPlainText(body)
      .split(/[；;]/)
      .map((entry) => normalizeWhitespace(entry))
      .filter(Boolean),
  );
}

function parseMarkdownTableRecords(body: string) {
  const rows = parseMarkdownTable(body);
  if (rows.length < 2) return [];

  const headers = rows[0]?.map((cell) => normalizeMatchKey(cell)) ?? [];
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

function readTableRecordValue(
  record: Record<string, string>,
  candidates: string[],
  fallbackIndex?: number,
) {
  for (const candidate of candidates) {
    const candidateKey = normalizeMatchKey(candidate);
    const matchedKey = Object.keys(record).find(
      (key) => key === candidateKey || key.includes(candidateKey) || candidateKey.includes(key),
    );
    if (matchedKey && record[matchedKey]) {
      return record[matchedKey];
    }
  }

  if (fallbackIndex === undefined) return "";
  return Object.values(record)[fallbackIndex] ?? "";
}

function extractFeatureName(heading: string) {
  return normalizeWhitespace(
    normalizeHeadingLabel(heading)
      .replace(/^能力项[：:]\s*/, "")
      .replace(/^业务功能[一二三四五六七八九十\d]*[：:]\s*/, "")
      .replace(/^功能项[一二三四五六七八九十\d]*[：:]\s*/, "")
      .replace(/^功能[一二三四五六七八九十\d]*[：:]\s*/, "")
      .replace(/[（(]\s*(?:FR|SR)[-_ ]?\d+\s*[）)]/gi, "")
      .trim(),
  );
}

function extractFeatureCode(heading: string) {
  return heading.match(/(?:FR|SR)[-_ ]?(\d+)/i)?.[1] ?? "";
}

function findFeatureSections(sections: MarkdownSection[]) {
  const explicitFeatureSections = sections.filter(
    (section) => section.level >= 3 && /^能力项[：:]/.test(section.heading),
  );
  if (explicitFeatureSections.length > 0) {
    return explicitFeatureSections;
  }

  const genericHeadings = new Set(
    [
      "概述",
      "需求背景",
      "业务目标",
      "业务价值",
      "术语",
      "术语定义",
      "业务概述",
      "业务处理流程",
      "业务流程",
      "业务功能详述",
      "业务规则",
      "输入和输出",
      "输入要素",
      "输出要素",
      "现状和存在的问题",
      "我行及同业现状",
      "我行存在的问题",
      "项目参与部门及职责",
      "功能描述",
      "功能分类",
      "标准系统功能描述",
      "特色系统需求",
      "数据要求",
      "非功能及系统级需求",
      "非功能性需求",
      "系统需求",
    ].map((heading) => normalizeMatchKey(heading)),
  );

  return sections.filter((section) => {
    if (section.level < 3) return false;

    const featureName = extractFeatureName(section.heading);
    const featureKey = normalizeMatchKey(featureName);
    if (!featureKey || genericHeadings.has(featureKey)) return false;

    const descendants = getDescendantSections(sections, section);
    const hasStructuredChildren = Boolean(
      findSectionByCandidates(descendants, [
        "业务流程",
        "主流程",
        "流程说明",
        "功能描述",
        "业务功能详述",
        "功能详述",
        "业务规则",
        "异常处理",
        "验收标准",
        "输入要素",
        "输出要素",
      ]),
    );
    const hasLabeledBlocks = Boolean(
      findLabeledBlock(parseLabeledBlocks(section.body), [
        "业务流程",
        "主流程",
        "流程说明",
        "功能描述",
        "业务功能详述",
        "功能详述",
        "业务规则",
        "异常处理",
        "验收标准",
        "输入要素",
        "输出要素",
      ]),
    );

    // Rely on structural detection: if a section has structured children
    // (业务流程, 业务规则, 输入/输出要素, etc.), it IS a feature section.
    // No name-based keyword check — this avoids missing features like
    // "投诉工单创建" that don't contain keywords like "管理" or "流程".
    return hasStructuredChildren || hasLabeledBlocks;
  });
}

function collectFeatureItems(
  sections: MarkdownSection[],
  featureSection: MarkdownSection,
  candidates: string[],
) {
  const descendants = getDescendantSections(sections, featureSection);
  const childSection = findSectionByCandidates(descendants, candidates);
  if (childSection) {
    const listItems = parseMarkdownList(childSection.body);
    if (listItems.length > 0) return listItems;
    return parsePlainItems(childSection.body);
  }

  const labeledBlock = findLabeledBlock(parseLabeledBlocks(featureSection.body), candidates);
  if (labeledBlock) {
    const listItems = parseMarkdownList(labeledBlock.body);
    if (listItems.length > 0) return listItems;
    return parsePlainItems(labeledBlock.body);
  }

  return [];
}

function collectFeatureTableRecords(
  sections: MarkdownSection[],
  featureSection: MarkdownSection,
  candidates: string[],
) {
  const descendants = getDescendantSections(sections, featureSection);
  const childSection = findSectionByCandidates(descendants, candidates);
  if (childSection) {
    const records = parseMarkdownTableRecords(childSection.body);
    if (records.length > 0) return records;
  }

  const labeledBlock = findLabeledBlock(parseLabeledBlocks(featureSection.body), candidates);
  if (labeledBlock) {
    const records = parseMarkdownTableRecords(labeledBlock.body);
    if (records.length > 0) return records;
  }

  return [];
}

function buildSectionValue(
  profile: DocxTemplateProfile,
  id: string,
  placeholder: string,
  rawContent: string,
) {
  const contract = findSectionContract(profile, id);
  const fallbackText = contract.fallbackText.trim();
  const cleaned = cleanLegacyText(safePlaceholderText(rawContent));
  const usedFallback =
    !cleaned || normalizeWhitespace(cleaned) === normalizeWhitespace(fallbackText);
  const content = usedFallback
    ? fallbackText
    : fitContentToBudget(cleaned, contract.targetChars, fallbackText);

  return {
    id,
    title: contract.title,
    placeholder,
    content,
    targetChars: contract.targetChars,
    usedFallback,
    required: contract.required,
  } satisfies DocxSectionValue;
}

function normalizeFeatureRecords(
  records: Record<string, string>[],
  fallback: string,
) {
  return records
    .map((record) => ({
      name: normalizeWhitespace(
        readTableRecordValue(record, ["字段名称", "字段", "参数名称", "名称"], 1) ||
          fallback,
      ),
      type: normalizeWhitespace(readTableRecordValue(record, ["类型", "数据类型"], 2) || "-"),
      required: normalizeWhitespace(
        readTableRecordValue(record, ["是否必填", "必填", "必输"], 3) || "-",
      ),
      enumValues: normalizeWhitespace(
        readTableRecordValue(record, ["枚举值", "取值范围", "值域"], 4) || "-",
      ),
      note: normalizeWhitespace(readTableRecordValue(record, ["备注", "说明", "描述"], 5) || "-"),
    }))
    .filter((record) => Boolean(record.name));
}

function buildFeatureBlocks(
  profile: DocxTemplateProfile,
  sections: MarkdownSection[],
) {
  const featureSections = findFeatureSections(sections);
  const fallbackItem = profile.featureBlock.fallbackText;

  if (featureSections.length === 0) {
    return [
      {
        index: 1,
        name: "预留功能项",
        code: "001",
        processItems: [fallbackItem],
        detailItems: [fallbackItem],
        ruleItems: [fallbackItem],
        inputRecords: [],
        outputRecords: [],
        targetChars: profile.featureBlock.targetChars,
        usedFallback: true,
      },
    ] satisfies DocxFeatureBlockModel[];
  }

  return featureSections.map((featureSection, index) => {
    const processRaw = collectFeatureItems(sections, featureSection, ["业务流程", "主流程", "流程说明"]);
    const detailRaw = collectFeatureItems(sections, featureSection, ["业务功能详述", "功能描述", "功能详述"]);
    const ruleRaw = uniqueNonEmpty([
      ...collectFeatureItems(sections, featureSection, ["业务规则", "规则说明"]),
      ...collectFeatureItems(sections, featureSection, ["异常处理", "异常场景"]),
      ...collectFeatureItems(sections, featureSection, ["验收标准", "验收要点"]),
    ]);

    const processItems = uniqueNonEmpty(
      (
        processRaw.length > 0
          ? processRaw
          : toSentenceList(
              markdownLinesToPlainText(
                getSectionBodyByCandidates(
                  getDescendantSections(sections, featureSection),
                  ["业务流程", "主流程", "流程说明"],
                ),
              ),
            )
      ).slice(0, 16),
    );
    const detailItems = uniqueNonEmpty(detailRaw).slice(0, 16);
    const ruleItems = uniqueNonEmpty(ruleRaw).slice(0, 16);

    const inputRecords = normalizeFeatureRecords(
      collectFeatureTableRecords(sections, featureSection, ["输入要素", "输入字段", "输入参数"]),
      "待补充",
    );
    const outputRecords = normalizeFeatureRecords(
      collectFeatureTableRecords(sections, featureSection, ["输出要素", "输出字段", "输出参数"]),
      "待补充",
    );

    const normalizedProcess = processItems.length > 0 ? processItems : [fallbackItem];
    const normalizedDetail = detailItems.length > 0 ? detailItems : [fallbackItem];
    const normalizedRules = ruleItems.length > 0 ? ruleItems : [fallbackItem];

    const rawCharCount =
      countVisibleChars(joinListAsParagraph(normalizedProcess)) +
      countVisibleChars(joinListAsParagraph(normalizedDetail)) +
      countVisibleChars(joinListAsParagraph(normalizedRules)) +
      countVisibleChars(
        inputRecords
          .map((record) => `${record.name}${record.type}${record.required}${record.enumValues}${record.note}`)
          .join(""),
      ) +
      countVisibleChars(
        outputRecords
          .map((record) => `${record.name}${record.type}${record.required}${record.enumValues}${record.note}`)
          .join(""),
      );

    return {
      index: index + 1,
      name: cleanLegacyText(extractFeatureName(featureSection.heading)) || `功能项${index + 1}`,
      code: extractFeatureCode(featureSection.heading) || `${index + 1}`.padStart(3, "0"),
      processItems: normalizedProcess,
      detailItems: normalizedDetail,
      ruleItems: normalizedRules,
      inputRecords: inputRecords.slice(0, profile.featureBlock.inputCapacity),
      outputRecords: outputRecords.slice(0, profile.featureBlock.outputCapacity),
      targetChars: profile.featureBlock.targetChars,
      usedFallback: rawCharCount === 0,
    } satisfies DocxFeatureBlockModel;
  });
}

function buildSpecialSystemContent(
  sections: MarkdownSection[],
  placeholderText: string,
  candidates: string[],
) {
  const direct = cleanLegacyText(getBodyTextByCandidatesStrict(sections, candidates));
  if (direct) {
    return fitContentToBudget(direct, 100, placeholderText);
  }
  return placeholderText;
}

function buildDataRequirementContent(
  sections: MarkdownSection[],
  candidates: string[],
  fallback: string,
) {
  const direct = cleanLegacyText(getBodyTextByCandidatesStrict(sections, candidates));
  if (!direct) return fallback;
  return fitContentToBudget(direct, Math.max(80, countVisibleChars(direct)), fallback);
}

function buildTermRecords(sections: MarkdownSection[], fallback: string) {
  const records = parseMarkdownTableRecords(
    getSectionBodyByCandidates(sections, ["术语", "术语定义", "名词解释"]),
  )
    .map((record) => ({
      term: normalizeWhitespace(readTableRecordValue(record, ["术语", "名词", "词汇"], 0) || ""),
      definition: normalizeWhitespace(
        readTableRecordValue(record, ["定义", "说明", "解释"], 1) || "",
      ),
    }))
    .filter((record) => record.term && record.definition);

  if (records.length > 0) {
    return records;
  }

  return [
    {
      term: "关键术语",
      definition: fallback,
    },
  ] satisfies DocxTermRecord[];
}

function buildFunctionCatalogRecords(params: {
  sections: MarkdownSection[];
  featureBlocks: DocxFeatureBlockModel[];
}) {
  const explicitTableRecords = parseMarkdownTableRecords(
    getSectionBodyByCandidates(params.sections, ["功能清单", "功能分类", "功能架构", "功能范围"]),
  )
    .map((record, index) => ({
      sequence: normalizeWhitespace(
        readTableRecordValue(record, ["序号", "序列"], 0) || `${index + 1}`,
      ),
      module: normalizeWhitespace(
        readTableRecordValue(record, ["功能模块", "模块", "分类"], 1) || "核心功能",
      ),
      name: normalizeWhitespace(
        readTableRecordValue(record, ["功能名称", "名称", "功能点"], 2) || "",
      ),
      note: normalizeWhitespace(readTableRecordValue(record, ["备注", "说明"], 3) || "-"),
    }))
    .filter((record) => record.name);

  if (explicitTableRecords.length > 0) {
    return explicitTableRecords;
  }

  const rawItems = parseMarkdownList(
    getSectionBodyByCandidates(params.sections, ["功能架构", "功能分类", "功能清单", "功能范围"]),
  );
  const hasRealFeatureBlocks = params.featureBlocks.some(
    (feature) => !feature.usedFallback && feature.name !== "预留功能项",
  );
  const normalizedItems = uniqueNonEmpty(
    rawItems.length > 0
      ? rawItems
      : hasRealFeatureBlocks
        ? params.featureBlocks.map((feature) => feature.name)
        : [],
  );

  return normalizedItems.map((item, index) => {
    const normalized = normalizeWhitespace(item);
    const pair = normalized.split(/[：:]/).map((value) => normalizeWhitespace(value));
    const hasModulePrefix = pair.length >= 2;
    return {
      sequence: `${index + 1}`,
      module: hasModulePrefix ? pair[0] || "核心功能" : "核心功能",
      name: hasModulePrefix ? pair.slice(1).join("：") || normalized : normalized,
      note: "-",
    } satisfies DocxFunctionCatalogRecord;
  });
}

export function buildDocxTemplatePayload(
  markdown: string,
  documentTitle: string,
  metadata?: {
    organization?: string;
    author?: string;
    version?: string;
    docDate?: string;
  },
  templateProfileId = USER_REQUIREMENTS_BASE_PROFILE.id,
) {
  const profile = resolveDocxTemplateProfile(templateProfileId);
  const sections = parseMarkdownSections(markdown);
  const placeholders: Record<string, string> = {};
  const normalizedTitle = documentTitle
    .replace(/[-—–]\s*产品需求文档$/i, "")
    .replace(/(?:需求规格说明书|需求说明书|产品需求文档|产品需求说明书|PRD)$/i, "")
    .trim();

  placeholders["项目名称"] = cleanLegacyText(normalizedTitle || "用户需求说明书");
  placeholders["制作单位"] = metadata?.organization?.trim() || "（部门）";
  placeholders["文档版本号"] = metadata?.version?.trim() || "V1.0";
  placeholders["日期"] = metadata?.docDate?.trim() || formatDocDate();
  placeholders["编写人员"] = metadata?.author?.trim() || "ReqAgent";
  placeholders["校对人员"] = metadata?.author?.trim() || "ReqAgent";
  placeholders["签署日期"] = metadata?.docDate?.trim() || formatDocDate();
  placeholders["占位符"] = "本期不涉及，预留后续接入。";

  const genericProblemSummary =
    getBodyTextByCandidatesStrict(sections, ["现状和存在的问题", "现状问题", "存在的问题"]) ||
    getBodyTextByCandidatesStrict(sections, ["现状问题分析", "业务层面问题", "管理层面问题", "系统层面问题"]);
  const genericProblemContent = cleanLegacyText(genericProblemSummary);
  const genericTerms = cleanLegacyText(getBodyTextByCandidates(sections, ["术语定义", "术语", "名词解释"]));
  const genericOverview = cleanLegacyText(getBodyTextByCandidates(sections, ["业务概述", "方案概述", "业务说明"]));
  const genericProcess = cleanLegacyText(
    getBodyTextByCandidates(sections, ["业务处理总流程", "业务处理流程", "整体流程", "业务流程"]),
  );
  const featureBlocks = buildFeatureBlocks(profile, sections);
  const termRecords = buildTermRecords(sections, findSectionContract(profile, "1.4").fallbackText);
  const functionCatalogRecords = buildFunctionCatalogRecords({
    sections,
    featureBlocks,
  });
  const featureNames = featureBlocks.map((feature) => feature.name);
  const parsedFeatureCategories = parseMarkdownList(
    getSectionBodyByCandidates(sections, ["功能架构", "功能分类", "功能清单", "功能范围"]),
  );
  const hasRealFeatureBlocks = featureBlocks.some(
    (featureBlock) => !featureBlock.usedFallback && featureBlock.name !== "预留功能项",
  );
  const functionalDomains = uniqueNonEmpty(
    parsedFeatureCategories.length > 0
      ? parsedFeatureCategories
      : hasRealFeatureBlocks
        ? featureNames
        : [],
  );

  const sectionValues = [
    buildSectionValue(
      profile,
      "1.1",
      "需求背景",
      getBodyTextByCandidates(sections, ["需求背景", "项目背景", "建设背景"]),
    ),
    buildSectionValue(
      profile,
      "1.2",
      "业务目标",
      getBodyTextByCandidates(sections, ["建设目标", "业务目标", "项目目标"]),
    ),
    buildSectionValue(
      profile,
      "1.3",
      "业务价值",
      getBodyTextByCandidates(sections, ["业务价值", "项目价值", "预期收益"]),
    ),
    buildSectionValue(profile, "1.4", "术语内容", genericTerms),
    buildSectionValue(profile, "2.1", "业务概述", genericOverview),
    buildSectionValue(
      profile,
      "2.2",
      "业务处理流程说明",
      genericProcess.includes("flowchart")
        ? buildFlowchartPlaceholder(genericProcess, "整体业务处理流程")
        : genericProcess,
    ),
    buildSectionValue(
      profile,
      "2.3.1",
      "同业现状",
      getBodyTextByCandidatesStrict(sections, ["我行及同业现状", "同业现状", "现状分析"]) ||
        genericProblemContent,
    ),
    buildSectionValue(
      profile,
      "2.3.2",
      "现存问题",
      getBodyTextByCandidatesStrict(sections, ["我行存在的问题", "现存问题", "存在的问题"]) ||
        genericProblemContent,
    ),
    buildSectionValue(
      profile,
      "3.1",
      "功能分类说明",
      functionCatalogRecords.map((record) => `${record.module}：${record.name}`).join("；"),
    ),
    buildSectionValue(
      profile,
      "3.3.1",
      "支付系统需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.1").fallbackText, ["支付系统", "支付相关需求"]),
    ),
    buildSectionValue(
      profile,
      "3.3.2",
      "回单系统需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.2").fallbackText, ["回单系统", "回单相关需求"]),
    ),
    buildSectionValue(
      profile,
      "3.3.3",
      "报表需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.3").fallbackText, ["报表", "报表需求", "统计报表"]),
    ),
    buildSectionValue(
      profile,
      "3.3.4",
      "询证函需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.4").fallbackText, ["询证函需求", "询证函"]),
    ),
    buildSectionValue(
      profile,
      "3.3.5",
      "京智柜面需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.5").fallbackText, ["京智柜面需求", "京智柜面"]),
    ),
    buildSectionValue(
      profile,
      "3.3.6",
      "核算引擎需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.6").fallbackText, ["核算引擎核算规则配置表", "核算引擎需求", "核算引擎"]),
    ),
    buildSectionValue(
      profile,
      "3.3.7",
      "对手信息需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.7").fallbackText, ["对手信息", "对手信息需求"]),
    ),
    buildSectionValue(
      profile,
      "3.3.8",
      "通知类业务需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.8").fallbackText, ["通知类业务", "通知类业务需求", "通知需求"]),
    ),
    buildSectionValue(
      profile,
      "3.3.9",
      "联网核查需求",
      buildSpecialSystemContent(sections, findSectionContract(profile, "3.3.9").fallbackText, ["联网核查系统", "联网核查需求", "联网核查"]),
    ),
    buildSectionValue(
      profile,
      "4.1",
      "外部数据范围说明",
      buildDataRequirementContent(sections, ["是否涉及使用外部数据", "外部数据使用情况"], findSectionContract(profile, "4.1").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.2",
      "授权方式",
      buildDataRequirementContent(sections, ["外部数据是否含有与客户有关的信息", "客户相关信息"], findSectionContract(profile, "4.2").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.3",
      "调整方案",
      buildDataRequirementContent(sections, ["是否涉及监管报送", "监管报送"], findSectionContract(profile, "4.3").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.4",
      "控制措施",
      buildDataRequirementContent(sections, ["是否落实数据分级分类管控要求", "数据分级分类管控要求"], findSectionContract(profile, "4.4").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.5",
      "数据分析需求",
      buildDataRequirementContent(sections, ["数据挖掘分析需求", "数据分析需求", "数据分析"], findSectionContract(profile, "4.5").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.6",
      "最小必要数据权限",
      buildDataRequirementContent(sections, ["是否差异化设置 “最小必要”数据权限", "最小必要数据权限"], findSectionContract(profile, "4.6").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.7",
      "数据对外提供",
      buildDataRequirementContent(sections, ["是否涉及数据对外提供", "数据对外提供"], findSectionContract(profile, "4.7").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.8",
      "三级及以上数据处理",
      buildDataRequirementContent(sections, ["是否涉及处理3级及以上数据", "3级及以上数据"], findSectionContract(profile, "4.8").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.9",
      "数据处理场景",
      buildDataRequirementContent(sections, ["是否涉及以下数据处理场景（多选）", "数据处理场景"], findSectionContract(profile, "4.9").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.10",
      "数据安全影响评估",
      buildDataRequirementContent(sections, ["是否涉及数据安全影响评估", "数据安全影响评估"], findSectionContract(profile, "4.10").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.11",
      "数据最短存储时间",
      buildDataRequirementContent(sections, ["是否明确数据最短存储时间", "数据最短存储时间"], findSectionContract(profile, "4.11").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.12",
      "数据备份与恢复要求",
      buildDataRequirementContent(sections, ["是否明确数据备份与恢复要求", "数据备份与恢复要求"], findSectionContract(profile, "4.12").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.13",
      "数据操作日志记录要求",
      buildDataRequirementContent(sections, ["是否明确数据操作日志记录要求", "数据操作日志记录要求"], findSectionContract(profile, "4.13").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.14",
      "数据安全风险监测范围与要求",
      buildDataRequirementContent(sections, ["是否明确数据安全风险监测范围与要求", "数据安全风险监测"], findSectionContract(profile, "4.14").fallbackText),
    ),
    buildSectionValue(
      profile,
      "4.15",
      "模型开发加工目的与收集目的一致性",
      buildDataRequirementContent(sections, ["是否审查模型开发加工目的与收集目的一致性", "模型开发加工目的与收集目的一致性"], findSectionContract(profile, "4.15").fallbackText),
    ),
    buildSectionValue(
      profile,
      "5.1",
      "非功能性需求",
      getBodyTextByCandidatesStrict(sections, ["非功能性需求", "非功能需求"]),
    ),
    buildSectionValue(
      profile,
      "5.2",
      "系统需求",
      getBodyTextByCandidatesStrict(sections, ["系统需求", "系统级需求"]),
    ),
  ];

  sectionValues.forEach((sectionValue) => {
    placeholders[sectionValue.placeholder] = sectionValue.content;
  });

  const departmentRecords = parseMarkdownTableRecords(
    getSectionBodyByCandidates(sections, ["项目参与部门及职责", "参与部门及职责", "参与方及职责"]),
  ).map((record) => ({
    department: normalizeWhitespace(
      readTableRecordValue(record, ["部门名称", "参与方", "部门", "机构"], 0) || "待补充",
    ),
    duty: normalizeWhitespace(readTableRecordValue(record, ["职责", "责任", "说明"], 1) || "待补充"),
  }));
  departmentRecords.slice(0, 2).forEach((record, index) => {
    placeholders[`部门${index + 1}`] = record.department;
    placeholders[`职责${index + 1}`] = record.duty;
  });

  if (featureBlocks[0]) {
    placeholders["功能名称1"] = featureBlocks[0].name;
    placeholders["功能编号1"] = featureBlocks[0].code;
  }
  assignSequence(placeholders, "功能域", functionalDomains, 12);
  assignSequence(
    placeholders,
    "步骤",
    toSentenceList(placeholders["业务处理流程说明"] || genericProcess),
    12,
  );

  termRecords.slice(0, 2).forEach((record, index) => {
    if (record.term) placeholders[`术语${index + 1}`] = record.term;
    if (record.definition) placeholders[`定义${index + 1}`] = record.definition;
  });

  placeholders["现状问题概述"] = genericProblemContent || findSectionContract(profile, "2.3.2").fallbackText;
  placeholders["外部数据是否使用"] = /不涉及|不使用|否/.test(placeholders["外部数据范围说明"] || "") ? "否" : "待确认";
  placeholders["审核编号"] = "待确认";
  placeholders["外部数据含客信息"] = /客户/.test(placeholders["授权方式"] || "") ? "是" : "否";
  placeholders["无需授权说明"] = findSectionContract(profile, "4.2").fallbackText;
  placeholders["监管报送影响"] = /不影响|暂不/.test(placeholders["调整方案"] || "") ? "否" : "待确认";
  placeholders["系统名称"] = "待确认";
  placeholders["字段范围"] = "待确认";
  placeholders["数据分级落实"] = "是";
  placeholders["性能要求"] = "按企业生产基线执行，满足业务高峰期正常处理要求。";
  placeholders["安全要求"] = "按现行权限、审计、数据保护和访问控制规范执行。";
  placeholders["可用性要求"] = "系统应支持核心功能稳定可用，并具备异常监控与告警能力。";
  placeholders["审计要求"] = "关键操作、配置变更和结果修正需完整留痕，可追溯操作主体与时间。";
  placeholders["兼容性要求"] = "与现有认证、组织、审批、消息及报表体系保持兼容。";
  placeholders["部署要求"] = "沿用现有生产部署基线，详细部署方案在后续设计阶段补充。";
  placeholders["依赖系统"] = "组织/权限、审批、消息、认证等企业基础系统。";
  placeholders["接口要求"] = "接口应满足幂等、可追踪和异常重试要求。";
  placeholders["监控要求"] = "需覆盖任务执行、接口失败、规则异常与关键操作告警。";
  placeholders["灾备要求"] = "沿用现网灾备体系，确保关键数据可恢复。";
  placeholders["变更1_1"] = metadata?.version?.trim() || "V1.0";
  placeholders["变更1_2"] = metadata?.docDate?.trim() || formatDocDate();
  placeholders["变更1_3"] = "全文";
  placeholders["变更1_4"] = "A";
  placeholders["变更1_5"] = "初稿生成";
  placeholders["变更1_6"] = metadata?.author?.trim() || "ReqAgent";
  placeholders["功能分类说明"] = functionalDomains.join("；");
  functionCatalogRecords.slice(0, 12).forEach((record, index) => {
    placeholders[`功能清单序号${index + 1}`] = record.sequence;
    placeholders[`功能模块${index + 1}`] = record.module;
    placeholders[`功能清单名称${index + 1}`] = record.name;
    placeholders[`功能清单备注${index + 1}`] = record.note;
  });

  const tableMetrics: DocxQualityTableMetric[] = [
    {
      tableId: "3.1",
      title: "功能清单",
      expectedRows: functionCatalogRecords.length,
      renderedRows: functionCatalogRecords.length,
      capacityRows: Math.max(1, functionCatalogRecords.length),
      completionRatio: functionCatalogRecords.length > 0 ? 1 : 0,
    },
    {
      tableId: "2.4",
      title: "项目参与部门及职责",
      expectedRows: departmentRecords.length,
      renderedRows: departmentRecords.length,
      capacityRows: Math.max(2, departmentRecords.length),
      completionRatio: departmentRecords.length > 0 ? 1 : 0,
    },
    ...featureBlocks.flatMap((feature) => [
      {
        tableId: `3.2.${feature.index}.input`,
        title: `3.2.${feature.index} 输入要素`,
        expectedRows: feature.inputRecords.length,
        renderedRows: feature.inputRecords.length,
        capacityRows: profile.featureBlock.inputCapacity,
        completionRatio:
          feature.inputRecords.length === 0
            ? 1
            : Number(
                (
                  Math.min(feature.inputRecords.length, profile.featureBlock.inputCapacity) /
                  feature.inputRecords.length
                ).toFixed(2),
              ),
      },
      {
        tableId: `3.2.${feature.index}.output`,
        title: `3.2.${feature.index} 输出要素`,
        expectedRows: feature.outputRecords.length,
        renderedRows: feature.outputRecords.length,
        capacityRows: profile.featureBlock.outputCapacity,
        completionRatio:
          feature.outputRecords.length === 0
            ? 1
            : Number(
                (
                  Math.min(feature.outputRecords.length, profile.featureBlock.outputCapacity) /
                  feature.outputRecords.length
                ).toFixed(2),
              ),
      },
    ]),
  ];

  return {
    profile,
    placeholderValues: placeholders,
    sectionValues,
    featureBlocks,
    termRecords,
    functionCatalogRecords,
    departmentRecords,
    tableMetrics,
  } satisfies DocxTemplateBuildResult;
}

export function buildTemplatePlaceholderValues(
  markdown: string,
  documentTitle: string,
  metadata?: {
    organization?: string;
    author?: string;
    version?: string;
    docDate?: string;
  },
  templateProfileId = USER_REQUIREMENTS_BASE_PROFILE.id,
) {
  return buildDocxTemplatePayload(markdown, documentTitle, metadata, templateProfileId)
    .placeholderValues;
}

/**
 * Remove <w:tr> rows where every <w:tc> cell contains no visible text.
 * This cleans up rows left empty after placeholder substitution.
 *
 * OOXML note: <w:tr> cannot nest inside <w:tr>, but <w:tc> CAN contain
 * nested tables (<w:tbl><w:tr><w:tc>...</w:tc></w:tr></w:tbl>).
 * We guard against this by preserving any row that contains a nested <w:tbl>.
 */
export function removeEmptyTableRows(xml: string) {
  return xml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (row) => {
    // Guard: if the row contains a nested table, never remove it —
    // non-greedy regex cannot reliably parse nested <w:tc> boundaries.
    if (/<w:tbl\b/.test(row)) return row;

    // Extract text from the entire row (all cells flattened).
    // If there is ANY visible text in any cell, keep the row.
    const text = row.replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
    return text.length === 0 ? "" : row;
  });
}

/**
 * Remove empty <w:p> paragraphs that contain no visible text.
 * Preserves structural paragraphs: page/section breaks, field codes,
 * images (both DrawingML and VML), and paragraphs inside table cells
 * (OOXML requires at least one <w:p> per <w:tc>).
 *
 * Strategy: instead of splitting on <w:tc> (fragile with nested tables),
 * we first collect all byte ranges occupied by <w:tbl> blocks, then only
 * remove <w:p> elements whose start position falls OUTSIDE any table.
 * This avoids the split-parity bug and nested-table corruption.
 */
export function removeEmptyParagraphs(xml: string) {
  // 1. Collect all top-level <w:tbl>...</w:tbl> ranges using a depth stack
  const tableRanges: Array<[number, number]> = [];
  const tagRegex = /<(\/?)w:tbl\b[^>]*>/g;
  let depth = 0;
  let rangeStart = 0;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(xml)) !== null) {
    if (!tagMatch[1]) {
      if (depth === 0) rangeStart = tagMatch.index;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) {
        tableRanges.push([rangeStart, tagMatch.index + tagMatch[0].length]);
      }
    }
  }

  function isInsideTable(position: number) {
    return tableRanges.some(([start, end]) => position >= start && position < end);
  }

  // 2. Replace empty <w:p> outside tables
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (para, offset) => {
    // Never touch paragraphs inside tables (cell structure depends on them)
    if (isInsideTable(offset)) return para;
    // Keep if it has visible text
    if (extractXmlText(para)) return para;
    // Keep if it has a page or section break
    if (/w:br\s+w:type="page"/.test(para)) return para;
    if (/<w:sectPr/.test(para)) return para;
    // Keep if it has field codes (TOC, PAGEREF, etc.)
    if (/<w:fldChar/.test(para)) return para;
    if (/<w:instrText/.test(para)) return para;
    // Keep if it has DrawingML or VML image content
    if (/<w:drawing/.test(para)) return para;
    if (/<w:pict/.test(para)) return para;
    // Otherwise remove
    return "";
  });
}

function getParagraphStyleId(paragraphXml: string) {
  return paragraphXml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1] ?? "";
}

function replaceOrInsertParagraphStyle(paragraphProperties: string, styleId: string) {
  if (!paragraphProperties) {
    return `<w:pPr><w:pStyle w:val="${escapeXmlText(styleId)}"/></w:pPr>`;
  }

  if (/<w:pStyle\b/.test(paragraphProperties)) {
    return paragraphProperties.replace(
      /<w:pStyle\b[^>]*w:val="[^"]*"[^/]*\/>/,
      `<w:pStyle w:val="${escapeXmlText(styleId)}"/>`,
    );
  }

  return paragraphProperties.replace(
    /<w:pPr\b[^>]*>/,
    `$&<w:pStyle w:val="${escapeXmlText(styleId)}"/>`,
  );
}

function normalizeParagraphProperties(
  paragraphProperties: string,
  options?: {
    paragraphStyleId?: string;
    removeNumbering?: boolean;
  },
) {
  let normalized = paragraphProperties || "<w:pPr></w:pPr>";

  if (options?.removeNumbering) {
    normalized = normalized.replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/g, "");
  }

  if (options?.paragraphStyleId) {
    normalized = replaceOrInsertParagraphStyle(normalized, options.paragraphStyleId);
  }

  return normalized;
}

function getFirstRunProperties(paragraphXml: string) {
  const runMatch = paragraphXml.match(/<w:r\b[\s\S]*?<\/w:r>/);
  if (!runMatch) return "";
  return runMatch[0].match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
}

function getOpenTag(xml: string, fallbackTag: string) {
  return xml.match(new RegExp(`^<${fallbackTag}\\b[^>]*>`))?.[0] ?? `<${fallbackTag}>`;
}

function buildPlainParagraphXml(
  templateParagraphXml: string,
  text: string,
  options?: {
    paragraphStyleId?: string;
    preserveParagraphProperties?: boolean;
    removeNumbering?: boolean;
    preserveFirstRunProperties?: boolean;
  },
) {
  const openTag = getOpenTag(templateParagraphXml, "w:p");
  const preservedPPr = options?.preserveParagraphProperties
    ? templateParagraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? ""
    : "";
  const paragraphStyleId = options?.paragraphStyleId?.trim();
  const paragraphProperties = normalizeParagraphProperties(
    paragraphStyleId
      ? preservedPPr || "<w:pPr></w:pPr>"
      : preservedPPr,
    {
      paragraphStyleId,
      removeNumbering: options?.removeNumbering,
    },
  );
  const bookmarkStarts = options?.preserveParagraphProperties
    ? (templateParagraphXml.match(/<w:bookmarkStart\b[^>]*\/>/g) ?? []).join("")
    : "";
  const bookmarkEnds = options?.preserveParagraphProperties
    ? (templateParagraphXml.match(/<w:bookmarkEnd\b[^>]*\/>/g) ?? []).join("")
    : "";
  const runProperties = options?.preserveFirstRunProperties
    ? getFirstRunProperties(templateParagraphXml)
    : "";

  return `${openTag}${paragraphProperties}${bookmarkStarts}<w:r>${runProperties}<w:t xml:space="preserve">${escapeXmlText(
    normalizeWhitespace(text),
  )}</w:t></w:r>${bookmarkEnds}</w:p>`;
}

function isHeadingBlock(block: DocxBodyBlock) {
  if (block.type !== "paragraph") return false;
  const styleId = getParagraphStyleId(block.xml);
  return HEADING_STYLE_IDS.includes(styleId as (typeof HEADING_STYLE_IDS)[number]) && Boolean(normalizeWhitespace(block.text));
}

function splitTableRows(tableXml: string) {
  return [...tableXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((match) => match[0] ?? "");
}

function splitTableCells(rowXml: string) {
  return [...rowXml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((match) => match[0] ?? "");
}

function renderCellXml(cellXml: string, text: string) {
  const openTag = getOpenTag(cellXml, "w:tc");
  const tcPr = cellXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
  const paragraphTemplate =
    cellXml.match(/<w:p\b[\s\S]*?<\/w:p>/)?.[0] ?? "<w:p><w:r><w:t></w:t></w:r></w:p>";
  const renderedParagraph = buildPlainParagraphXml(paragraphTemplate, text, {
    preserveParagraphProperties: true,
    removeNumbering: true,
    preserveFirstRunProperties: true,
  });
  return `${openTag}${tcPr}${renderedParagraph}</w:tc>`;
}

function renderTableRowXml(rowXml: string, values: string[]) {
  const openTag = getOpenTag(rowXml, "w:tr");
  const trPr = rowXml.match(/<w:trPr\b[\s\S]*?<\/w:trPr>/)?.[0] ?? "";
  const cells = splitTableCells(rowXml);
  if (cells.length === 0) return rowXml;

  const renderedCells = cells.map((cellXml, index) => renderCellXml(cellXml, values[index] ?? ""));
  return `${openTag}${trPr}${renderedCells.join("")}</w:tr>`;
}

function renderTableFromTemplate(params: {
  tableXml: string;
  rowAnchorPattern: RegExp;
  headerValues?: string[];
  rowValues: string[][];
}) {
  const rows = splitTableRows(params.tableXml);
  if (rows.length === 0) {
    return params.tableXml;
  }

  const anchorRow = rows.find((row) => params.rowAnchorPattern.test(row));
  const templateRow = anchorRow ?? rows[1];
  if (!templateRow) {
    return params.tableXml;
  }

  const firstTemplateRow = anchorRow ? rows.indexOf(templateRow) : 1;
  const lastTemplateRow = anchorRow
    ? rows.reduce((last, row, rowIndex) => {
        if (params.rowAnchorPattern.test(row)) return rowIndex;
        return last;
      }, firstTemplateRow)
    : rows.length - 1;

  const renderedRows = params.rowValues.map((values) => renderTableRowXml(templateRow, values));
  const rebuiltRows = [
    ...rows.slice(0, firstTemplateRow),
    ...renderedRows,
    ...rows.slice(lastTemplateRow + 1),
  ];

  if (params.headerValues && rebuiltRows[0]) {
    rebuiltRows[0] = renderTableRowXml(rows[0] ?? rebuiltRows[0], params.headerValues);
  }

  const startOffset = params.tableXml.indexOf(rows[0] ?? "");
  const lastRow = rows[rows.length - 1] ?? "";
  const endOffset = params.tableXml.lastIndexOf(lastRow);
  if (startOffset === -1 || endOffset === -1) return params.tableXml;

  return `${params.tableXml.slice(0, startOffset)}${rebuiltRows.join("")}${params.tableXml.slice(
    endOffset + lastRow.length,
  )}`;
}

function replaceSectionBodyByHeading(
  documentXml: string,
  headingText: string,
  buildBodyBlocks: (blocks: DocxBodyBlock[], headingIndex: number, sectionEnd: number) => string[],
) {
  const { prefix, suffix, blocks } = parseDocxBodyBlocks(documentXml);
  const headingIndex = blocks.findIndex(
    (block) =>
      block.type === "paragraph" &&
      normalizeWhitespace(block.text) === normalizeWhitespace(headingText) &&
      isHeadingBlock(block),
  );
  if (headingIndex === -1) return documentXml;

  const sectionEnd = blocks.findIndex((block, index) => index > headingIndex && isHeadingBlock(block));
  const effectiveSectionEnd = sectionEnd === -1 ? blocks.length : sectionEnd;
  const rebuiltBlocks = [
    ...blocks.slice(0, headingIndex + 1).map((block) => block.xml),
    ...buildBodyBlocks(blocks, headingIndex, effectiveSectionEnd),
    ...blocks.slice(effectiveSectionEnd).map((block) => block.xml),
  ];

  return `${prefix}${rebuiltBlocks.join("")}${suffix}`;
}

function splitDocumentXml(documentXml: string) {
  const bodyStart = documentXml.indexOf("<w:body>");
  const bodyEnd = documentXml.lastIndexOf("</w:body>");

  if (bodyStart === -1 || bodyEnd === -1) {
    throw new Error("Invalid DOCX document.xml: missing <w:body>");
  }

  return {
    prefix: documentXml.slice(0, bodyStart + "<w:body>".length),
    bodyXml: documentXml.slice(bodyStart + "<w:body>".length, bodyEnd),
    suffix: documentXml.slice(bodyEnd),
  };
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBalancedTagXml(xml: string, startIndex: number, tag: string) {
  const matcher = new RegExp(`<(/?)${escapeRegex(tag)}\\b[^>]*>`, "g");
  matcher.lastIndex = startIndex;

  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(xml)) !== null) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      return xml.slice(startIndex, match.index + match[0].length);
    }
  }

  return undefined;
}

function extractBalancedTagBlocks(xml: string, tag: string) {
  const matcher = new RegExp(`<${escapeRegex(tag)}\\b`, "g");
  const blocks: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(xml)) !== null) {
    if (match.index < cursor) continue;
    const blockXml = extractBalancedTagXml(xml, match.index, tag);
    if (!blockXml) break;

    blocks.push(blockXml);
    cursor = match.index + blockXml.length;
    matcher.lastIndex = cursor;
  }

  return blocks;
}

function extractBodyBlockXml(bodyXml: string, startIndex: number, tag: string) {
  if (tag === "w:p") {
    const endIndex = bodyXml.indexOf("</w:p>", startIndex);
    return endIndex === -1 ? undefined : bodyXml.slice(startIndex, endIndex + "</w:p>".length);
  }

  if (tag === "w:sectPr") {
    const endIndex = bodyXml.indexOf("</w:sectPr>", startIndex);
    return endIndex === -1
      ? undefined
      : bodyXml.slice(startIndex, endIndex + "</w:sectPr>".length);
  }

  if (tag === "w:tbl") {
    return extractBalancedTagXml(bodyXml, startIndex, tag);
  }

  return undefined;
}

function parseDocxBodyBlocks(documentXml: string) {
  const { prefix, bodyXml, suffix } = splitDocumentXml(documentXml);
  const blocks: DocxBodyBlock[] = [];
  const matcher = /<(w:p|w:tbl|w:sectPr)\b/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(bodyXml)) !== null) {
    const startIndex = match.index;
    if (startIndex < cursor) continue;
    const tag = match[1] ?? "";
    const xml = extractBodyBlockXml(bodyXml, startIndex, tag);
    if (!xml) break;

    blocks.push({
      type: tag === "w:p" ? "paragraph" : tag === "w:tbl" ? "table" : "section",
      xml,
      text: extractXmlText(xml),
    });

    cursor = startIndex + xml.length;
    matcher.lastIndex = cursor;
  }

  return { prefix, suffix, blocks };
}

function ensureXmlSpaceAttribute(attributes: string, value: string) {
  if (!value || !/(^\s)|(\s$)|\s{2,}|\n|\t/.test(value) || attributes.includes('xml:space="preserve"')) {
    return attributes;
  }
  return `${attributes} xml:space="preserve"`;
}

function replaceParagraphTextPlaceholders(
  paragraphXml: string,
  placeholderValues: Record<string, string>,
  options?: { stripResidualPlaceholders?: boolean },
) {
  const textNodePattern = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g;
  const textNodes = [...paragraphXml.matchAll(textNodePattern)];
  if (textNodes.length === 0) return paragraphXml;

  const combinedText = textNodes
    .map((match) => decodeXmlEntities(match[2] ?? ""))
    .join("");
  if (!combinedText.includes("{{")) return paragraphXml;

  let replacedText = combinedText;
  for (const [key, rawValue] of Object.entries(placeholderValues)) {
    replacedText = replacedText.split(`{{${key}}}`).join(rawValue.trim());
  }
  if (options?.stripResidualPlaceholders) {
    replacedText = replacedText.replace(/\{\{[^{}]+\}\}/g, "");
  }
  if (replacedText === combinedText) return paragraphXml;

  let wroteReplacement = false;
  return paragraphXml.replace(textNodePattern, (_match, rawAttributes = "") => {
    if (wroteReplacement) {
      return `<w:t${rawAttributes}></w:t>`;
    }

    wroteReplacement = true;
    const attributes = ensureXmlSpaceAttribute(rawAttributes, replacedText);
    return `<w:t${attributes}>${escapeXmlText(replacedText)}</w:t>`;
  });
}

export function replaceDocxPlaceholders(
  xml: string,
  placeholderValues: Record<string, string>,
  options?: { stripResidualPlaceholders?: boolean },
) {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) =>
    replaceParagraphTextPlaceholders(paragraphXml, placeholderValues, options),
  );
}

function renderLocalPlaceholderXml(xml: string, placeholderValues: Record<string, string>) {
  const normalizedValues = Object.fromEntries(
    Object.entries(placeholderValues).map(([key, rawValue]) => [key, rawValue.trim()]),
  );

  if (normalizedValues["功能标题1"] && !normalizedValues["功能名称1"]) {
    normalizedValues["功能名称1"] = normalizeWhitespace(normalizedValues["功能标题1"]);
  }

  let rendered = replaceDocxPlaceholders(xml, normalizedValues, {
    stripResidualPlaceholders: true,
  });
  rendered = rendered.replace(/\{\{[^{}]+\}\}/g, "");
  rendered = removeEmptyTableRows(rendered);
  rendered = removeEmptyParagraphs(rendered);
  return rendered;
}

function buildFeatureBodyParagraphs(
  templateParagraphXml: string,
  items: string[],
  formatter: (item: string, index: number) => string,
) {
  const normalizedItems = items.map((item) => normalizeWhitespace(item)).filter(Boolean);
  if (normalizedItems.length === 0) {
    return [
      buildPlainParagraphXml(templateParagraphXml, USER_REQUIREMENTS_BASE_PROFILE.featureBlock.fallbackText, {
        paragraphStyleId: BODY_STYLE_ID,
      }),
    ];
  }

  return normalizedItems.map((item, index) =>
    buildPlainParagraphXml(templateParagraphXml, formatter(item, index), {
      paragraphStyleId: BODY_STYLE_ID,
    }),
  );
}

function buildFeatureIoRows(records: DocxFeatureRecord[]) {
  if (records.length > 0) {
    return records.map((record, index) => [
      String(index + 1),
      record.name || "待补充",
      record.type || "-",
      record.required || "-",
      record.enumValues || "-",
      record.note || "-",
    ]);
  }

  return [["1", "待补充", "-", "-", "-", USER_REQUIREMENTS_BASE_PROFILE.featureBlock.fallbackText]];
}

function renderFeatureBlocks(documentXml: string, featureBlocks: DocxFeatureBlockModel[]) {
  if (featureBlocks.length === 0) {
    return documentXml;
  }

  const { prefix, suffix, blocks } = parseDocxBodyBlocks(documentXml);
  const featureStart = blocks.findIndex(
    (block) =>
      block.type === "paragraph" &&
      !block.text.includes("PAGEREF") &&
      block.text.includes(FEATURE_BLOCK_START_ANCHOR),
  );
  const featureEnd = blocks.findIndex(
    (block, index) =>
      index > featureStart &&
      block.type === "paragraph" &&
      !block.text.includes("PAGEREF") &&
      normalizeWhitespace(block.text) === FEATURE_BLOCK_END_ANCHOR,
  );

  if (featureStart === -1 || featureEnd === -1) {
    return documentXml;
  }

  const featureTemplateBlocks = blocks.slice(featureStart, featureEnd);
  const bodyParagraphTemplate =
    blocks.find(
      (block) =>
        block.type === "paragraph" &&
        getParagraphStyleId(block.xml) === BODY_STYLE_ID &&
        !normalizeWhitespace(block.text),
    )?.xml ??
    blocks.find(
      (block) =>
        block.type === "paragraph" &&
        getParagraphStyleId(block.xml) === BODY_STYLE_ID,
    )?.xml ??
    `<w:p><w:pPr><w:pStyle w:val="${BODY_STYLE_ID}"/></w:pPr><w:r><w:t></w:t></w:r></w:p>`;
  const featureHeadingTemplate =
    featureTemplateBlocks.find(
      (block) =>
        block.type === "paragraph" &&
        block.text.includes(FEATURE_BLOCK_START_ANCHOR),
    )?.xml ?? bodyParagraphTemplate;
  const subheadingTemplateByText = new Map(
    featureTemplateBlocks
      .filter((block) => block.type === "paragraph")
      .map((block) => [normalizeWhitespace(block.text), block.xml]),
  );
  const featureTables = featureTemplateBlocks.filter((block) => block.type === "table");
  const inputTableTemplate = featureTables[0]?.xml ?? "";
  const outputTableTemplate = featureTables[1]?.xml ?? "";

  const renderedFeatureXml = featureBlocks
    .map((feature, featureIndex) => {
      const processParagraphs = buildFeatureBodyParagraphs(
        bodyParagraphTemplate,
        feature.processItems,
        (item, index) => `${index + 1}、${item}`,
      );
      const detailParagraphs = buildFeatureBodyParagraphs(
        bodyParagraphTemplate,
        feature.detailItems,
        (item) => item,
      );
      const ruleParagraphs = buildFeatureBodyParagraphs(
        bodyParagraphTemplate,
        feature.ruleItems,
        (item, index) => `（${index + 1}）${item}`,
      );

      const featureHeading = buildPlainParagraphXml(
        featureHeadingTemplate,
        `3.2.${feature.index} 业务功能${toChineseFeatureLabel(featureIndex + 1)}：${feature.name}`,
        {
          preserveParagraphProperties: true,
          removeNumbering: true,
          paragraphStyleId: BASE_DOCX_STYLES.heading3,
        },
      );
      const processHeading = buildPlainParagraphXml(
        subheadingTemplateByText.get("业务流程") ?? featureHeadingTemplate,
        `3.2.${feature.index}.1 业务流程`,
        {
          preserveParagraphProperties: true,
          removeNumbering: true,
          paragraphStyleId: BASE_DOCX_STYLES.heading4,
        },
      );
      const detailHeading = buildPlainParagraphXml(
        subheadingTemplateByText.get("业务功能详述") ?? featureHeadingTemplate,
        `3.2.${feature.index}.2 业务功能详述`,
        {
          preserveParagraphProperties: true,
          removeNumbering: true,
          paragraphStyleId: BASE_DOCX_STYLES.heading4,
        },
      );
      const ruleHeading = buildPlainParagraphXml(
        subheadingTemplateByText.get("业务规则") ?? featureHeadingTemplate,
        `3.2.${feature.index}.3 业务规则`,
        {
          preserveParagraphProperties: true,
          removeNumbering: true,
          paragraphStyleId: BASE_DOCX_STYLES.heading4,
        },
      );
      const ioHeading = buildPlainParagraphXml(
        subheadingTemplateByText.get("输入和输出") ?? featureHeadingTemplate,
        `3.2.${feature.index}.4 输入和输出`,
        {
          preserveParagraphProperties: true,
          removeNumbering: true,
          paragraphStyleId: BASE_DOCX_STYLES.heading4,
        },
      );
      const inputLabel = buildPlainParagraphXml(
        subheadingTemplateByText.get("输入要素") ?? bodyParagraphTemplate,
        "输入要素",
        {
          preserveParagraphProperties: true,
          removeNumbering: true,
          preserveFirstRunProperties: true,
        },
      );
      const outputLabel = buildPlainParagraphXml(
        subheadingTemplateByText.get("输出要素") ?? bodyParagraphTemplate,
        "输出要素",
        {
          preserveParagraphProperties: true,
          removeNumbering: true,
          preserveFirstRunProperties: true,
        },
      );

      const inputTable = inputTableTemplate
        ? renderTableFromTemplate({
            tableXml: inputTableTemplate,
            rowAnchorPattern: /\{\{输入字段\d+\}\}/,
            rowValues: buildFeatureIoRows(feature.inputRecords),
          })
        : "";
      const outputTable = outputTableTemplate
        ? renderTableFromTemplate({
            tableXml: outputTableTemplate,
            rowAnchorPattern: /\{\{输出字段\d+\}\}/,
            rowValues: buildFeatureIoRows(feature.outputRecords),
          })
        : "";

      return [
        featureHeading,
        processHeading,
        ...processParagraphs,
        detailHeading,
        ...detailParagraphs,
        ruleHeading,
        ...ruleParagraphs,
        ioHeading,
        inputLabel,
        inputTable,
        outputLabel,
        outputTable,
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  const rebuiltBodyXml = [
    ...blocks.slice(0, featureStart).map((block) => block.xml),
    renderedFeatureXml,
    ...blocks.slice(featureEnd).map((block) => block.xml),
  ].join("");

  return `${prefix}${rebuiltBodyXml}${suffix}`;
}

function expandFeatureBlocks(documentXml: string, featureBlocks: DocxFeatureBlockModel[]) {
  return {
    documentXml: renderFeatureBlocks(documentXml, featureBlocks),
    inputCapacity: USER_REQUIREMENTS_BASE_PROFILE.featureBlock.inputCapacity,
    outputCapacity: USER_REQUIREMENTS_BASE_PROFILE.featureBlock.outputCapacity,
  };
}

export function expandDepartmentRows(documentXml: string, records: Array<{ department: string; duty: string }>) {
  if (records.length === 0 || !documentXml.includes(DEPARTMENT_ROW_ANCHOR)) {
    return documentXml;
  }

  const renderDepartmentTable = (tableXml: string) => {
    const rows = extractBalancedTagBlocks(tableXml, "w:tr");
    const templateRow = rows.find((row) => row.includes(DEPARTMENT_ROW_ANCHOR));
    if (!templateRow) {
      return tableXml;
    }

    const normalizedTemplateRow = templateRow
      .replace(/\{\{部门\d+\}\}/g, "{{部门1}}")
      .replace(/\{\{职责\d+\}\}/g, "{{职责1}}");
    const renderedRows = records.map((record) =>
      renderLocalPlaceholderXml(normalizedTemplateRow, {
        部门1: record.department,
        职责1: record.duty,
      }),
    );

    const firstTemplateRow = rows.indexOf(templateRow);
    const lastTemplateRow = rows.reduce((last, row, rowIndex) => {
      if (row.includes("{{部门")) return rowIndex;
      return last;
    }, firstTemplateRow);
    const startRow = rows[firstTemplateRow] ?? "";
    const endRow = rows[lastTemplateRow] ?? "";
    const startOffset = tableXml.indexOf(startRow);
    const endOffset = tableXml.indexOf(endRow, startOffset) + endRow.length;
    if (startOffset === -1 || endOffset < startOffset) {
      return tableXml;
    }

    return `${tableXml.slice(0, startOffset)}${renderedRows.join("")}${tableXml.slice(endOffset)}`;
  };

  if (!documentXml.includes("<w:body>")) {
    return renderDepartmentTable(documentXml);
  }

  const { prefix, suffix, blocks } = parseDocxBodyBlocks(documentXml);
  let didExpand = false;

  const rebuiltBlocks = blocks.map((block) => {
    if (block.type !== "table" || !block.xml.includes(DEPARTMENT_ROW_ANCHOR)) {
      return block.xml;
    }

    const expandedTableXml = renderDepartmentTable(block.xml);
    if (expandedTableXml !== block.xml) {
      didExpand = true;
    }

    return expandedTableXml;
  });

  if (!didExpand) {
    return documentXml;
  }

  return `${prefix}${rebuiltBlocks.join("")}${suffix}`;
}

function removeLegacyDocxParagraphs(documentXml: string) {
  return documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const text = normalizeWhitespace(extractXmlText(paragraphXml));
    if (!text && /<w:object|<w:pict/.test(paragraphXml)) return "";
    if (USER_REQUIREMENTS_BASE_PROFILE.legacyTerms.some((term) => text.includes(term))) {
      return "";
    }
    if (/^SR[_-]?\d+/i.test(text) || text.includes("SR_{{")) return "";
    if (/<w:object|<w:pict/.test(paragraphXml)) return "";
    return paragraphXml;
  });
}

function restructureTermsSection(
  documentXml: string,
  buildResult?: DocxTemplateBuildResult,
) {
  if (!buildResult) return documentXml;

  const headingText = findSectionContract(buildResult.profile, "1.4").title;
  return replaceSectionBodyByHeading(documentXml, headingText, (blocks, headingIndex) => {
    const departmentHeadingIndex = blocks.findIndex(
      (block) =>
        block.type === "paragraph" &&
        normalizeWhitespace(block.text) === "项目参与部门及职责" &&
        isHeadingBlock(block),
    );
    const departmentTable = departmentHeadingIndex === -1
      ? undefined
      : blocks
          .slice(departmentHeadingIndex + 1)
          .find((block) => block.type === "table")?.xml;

    if (!departmentTable) {
      const paragraphTemplate =
        blocks.find(
          (block) =>
            block.type === "paragraph" &&
            getParagraphStyleId(block.xml) === BODY_STYLE_ID &&
            !normalizeWhitespace(block.text),
        )?.xml ??
        blocks[headingIndex]?.xml ??
        `<w:p><w:pPr><w:pStyle w:val="${BODY_STYLE_ID}"/></w:pPr><w:r><w:t></w:t></w:r></w:p>`;
      return buildResult.termRecords.map((record) =>
        buildPlainParagraphXml(paragraphTemplate, `${record.term}：${record.definition}`, {
          paragraphStyleId: BODY_STYLE_ID,
        }),
      );
    }

    return [
      renderTableFromTemplate({
        tableXml: departmentTable,
        rowAnchorPattern: /\{\{部门\d+\}\}/,
        headerValues: ["术语", "定义"],
        rowValues: buildResult.termRecords.map((record) => [record.term, record.definition]),
      }),
    ];
  });
}

function restructureBusinessProcessSection(
  documentXml: string,
  buildResult?: DocxTemplateBuildResult,
) {
  if (!buildResult) return documentXml;
  const processSection = buildResult.sectionValues.find((section) => section.id === "2.2");
  if (!processSection) return documentXml;

  const processItems = buildResult.featureBlocks[0]?.processItems ?? [];
  const processSummary =
    processItems.length > 0
      ? `流程摘要：${processItems.slice(0, 6).join("；")}。`
      : "流程摘要：按既定业务链路完成受理、处理、校验与结果输出。";
  const flowPlaceholder = buildFlowchartPlaceholder(
    processSection.content,
    "整体业务处理流程",
  );

  return replaceSectionBodyByHeading(documentXml, processSection.title, (blocks, headingIndex) => {
    const paragraphTemplate =
      blocks.find(
        (block) =>
          block.type === "paragraph" &&
          getParagraphStyleId(block.xml) === BODY_STYLE_ID &&
          !normalizeWhitespace(block.text),
      )?.xml ??
      blocks[headingIndex]?.xml ??
      `<w:p><w:pPr><w:pStyle w:val="${BODY_STYLE_ID}"/></w:pPr><w:r><w:t></w:t></w:r></w:p>`;

    return [
      buildPlainParagraphXml(paragraphTemplate, processSummary, {
        paragraphStyleId: BODY_STYLE_ID,
      }),
      buildPlainParagraphXml(paragraphTemplate, flowPlaceholder, {
        paragraphStyleId: BODY_STYLE_ID,
      }),
    ];
  });
}

function restructureCurrentStateSection(
  documentXml: string,
  buildResult?: DocxTemplateBuildResult,
) {
  if (!buildResult) return documentXml;

  const overviewValue = buildResult.sectionValues.find((section) => section.id === "2.3.1");
  const problemValue = buildResult.sectionValues.find((section) => section.id === "2.3.2");
  if (!overviewValue || !problemValue) return documentXml;

  const { prefix, suffix, blocks } = parseDocxBodyBlocks(documentXml);
  const sectionStart = blocks.findIndex(
    (block) =>
      block.type === "paragraph" &&
      getParagraphStyleId(block.xml) === BASE_DOCX_STYLES.heading2 &&
      normalizeWhitespace(block.text) === "现状和存在的问题",
  );
  const sectionEnd = blocks.findIndex(
    (block, index) =>
      index > sectionStart &&
      block.type === "paragraph" &&
      getParagraphStyleId(block.xml) === BASE_DOCX_STYLES.heading2 &&
      normalizeWhitespace(block.text) === "项目参与部门及职责",
  );

  if (sectionStart === -1 || sectionEnd === -1) return documentXml;

  const sectionBlocks = blocks.slice(sectionStart + 1, sectionEnd);
  const headingBlocks = sectionBlocks.filter(
    (block) => block.type === "paragraph" && getParagraphStyleId(block.xml) === BASE_DOCX_STYLES.heading3,
  );
  if (headingBlocks.length < 2) return documentXml;

  const bodyTemplate =
    sectionBlocks.find(
      (block) =>
        block.type === "paragraph" &&
        getParagraphStyleId(block.xml) === BODY_STYLE_ID &&
        !normalizeWhitespace(block.text),
    )?.xml ??
    blocks[sectionStart].xml;

  const rebuiltBlocks = [
    ...blocks.slice(0, sectionStart + 1).map((block) => block.xml),
    buildPlainParagraphXml(headingBlocks[0]?.xml ?? bodyTemplate, overviewValue.title, {
      preserveParagraphProperties: true,
      paragraphStyleId: BASE_DOCX_STYLES.heading3,
    }),
    buildPlainParagraphXml(bodyTemplate, overviewValue.content, { paragraphStyleId: BODY_STYLE_ID }),
    buildPlainParagraphXml(headingBlocks[1]?.xml ?? bodyTemplate, problemValue.title, {
      preserveParagraphProperties: true,
      paragraphStyleId: BASE_DOCX_STYLES.heading3,
    }),
    buildPlainParagraphXml(bodyTemplate, problemValue.content, { paragraphStyleId: BODY_STYLE_ID }),
    ...blocks.slice(sectionEnd).map((block) => block.xml),
  ];

  return `${prefix}${rebuiltBlocks.join("")}${suffix}`;
}

function restructureFunctionCategorySection(
  documentXml: string,
  buildResult?: DocxTemplateBuildResult,
) {
  if (!buildResult) return documentXml;

  const functionCategoryValue = buildResult.sectionValues.find((section) => section.id === "3.1");
  if (!functionCategoryValue?.content) return documentXml;

  return replaceSectionBodyByHeading(documentXml, functionCategoryValue.title, (blocks, headingIndex, sectionEnd) => {
    const sectionBlocks = blocks.slice(headingIndex + 1, sectionEnd);
    const tableTemplate = sectionBlocks.find(
      (block) => block.type === "table" && block.xml.includes(FUNCTION_CATALOG_ROW_ANCHOR),
    )?.xml;
    const paragraphTemplate =
      sectionBlocks.find(
        (block) =>
          block.type === "paragraph" &&
          getParagraphStyleId(block.xml) === BODY_STYLE_ID &&
          !normalizeWhitespace(block.text),
      )?.xml ??
      blocks[headingIndex]?.xml ??
      `<w:p><w:pPr><w:pStyle w:val="${BODY_STYLE_ID}"/></w:pPr><w:r><w:t></w:t></w:r></w:p>`;

    if (!tableTemplate) {
      return [
        buildPlainParagraphXml(paragraphTemplate, functionCategoryValue.content, {
          paragraphStyleId: BODY_STYLE_ID,
        }),
      ];
    }

    return [
      renderTableFromTemplate({
        tableXml: tableTemplate,
        rowAnchorPattern: /\{\{功能模块\d+\}\}/,
        headerValues: ["序号", "功能模块", "功能名称", "备注"],
        rowValues: buildResult.functionCatalogRecords.map((record) => [
          record.sequence,
          record.module,
          record.name,
          record.note,
        ]),
      }),
    ];
  });
}

function restructureSimpleBodySections(
  documentXml: string,
  buildResult: DocxTemplateBuildResult | undefined,
  sectionIds: string[],
) {
  if (!buildResult) return documentXml;

  const targetSections = buildResult.sectionValues.filter((section) => sectionIds.includes(section.id));
  if (targetSections.length === 0) return documentXml;

  const targetByTitle = new Map(
    targetSections.map((section) => [normalizeWhitespace(section.title), section]),
  );
  const { prefix, suffix, blocks } = parseDocxBodyBlocks(documentXml);
  const rebuiltBlocks: string[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const styleId = getParagraphStyleId(block.xml);
    const targetSection =
      block.type === "paragraph" &&
      SECTION_HEADING_STYLE_IDS.includes(styleId as (typeof SECTION_HEADING_STYLE_IDS)[number])
        ? targetByTitle.get(normalizeWhitespace(block.text))
        : undefined;

    if (!targetSection) {
      rebuiltBlocks.push(block.xml);
      continue;
    }

    rebuiltBlocks.push(block.xml);

    let nextIndex = index + 1;
    let bodyTemplate = block.xml;
    while (nextIndex < blocks.length) {
      const nextBlock = blocks[nextIndex];
      const nextStyleId = nextBlock.type === "paragraph" ? getParagraphStyleId(nextBlock.xml) : "";
      const isNextHeading =
        nextBlock.type === "paragraph" &&
        HEADING_STYLE_IDS.includes(nextStyleId as (typeof HEADING_STYLE_IDS)[number]) &&
        normalizeWhitespace(nextBlock.text);

      if (isNextHeading) break;

      if (
        nextBlock.type === "paragraph" &&
        !HEADING_STYLE_IDS.includes(nextStyleId as (typeof HEADING_STYLE_IDS)[number]) &&
        (!normalizeWhitespace(nextBlock.text) || nextBlock.text.includes("{{"))
      ) {
        bodyTemplate = nextBlock.xml;
      }

      nextIndex += 1;
    }

    rebuiltBlocks.push(
      buildPlainParagraphXml(bodyTemplate, targetSection.content, {
        paragraphStyleId: BODY_STYLE_ID,
      }),
    );
    index = nextIndex - 1;
  }

  return `${prefix}${rebuiltBlocks.join("")}${suffix}`;
}

function applyProfileDrivenShellTransforms(
  documentXml: string,
  buildResult?: DocxTemplateBuildResult,
) {
  let transformed = documentXml;
  transformed = restructureTermsSection(transformed, buildResult);
  transformed = restructureBusinessProcessSection(transformed, buildResult);
  transformed = restructureCurrentStateSection(transformed, buildResult);
  transformed = restructureFunctionCategorySection(transformed, buildResult);
  transformed = restructureSimpleBodySections(transformed, buildResult, [
    "3.3.1",
    "3.3.2",
    "3.3.3",
    "3.3.4",
    "3.3.5",
    "3.3.6",
    "3.3.7",
    "3.3.8",
    "3.3.9",
    "4.1",
    "4.2",
    "4.3",
    "4.4",
    "4.5",
    "4.6",
    "4.7",
    "4.8",
    "4.9",
    "4.10",
    "4.11",
    "4.12",
    "4.13",
    "4.14",
    "4.15",
    "5.1",
    "5.2",
  ]);
  return transformed;
}

async function listExtractedFiles(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listExtractedFiles(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

async function enableUpdateFieldsOnOpen(tempDir: string) {
  const settingsPath = path.join(tempDir, "word", "settings.xml");
  const settingsXml = await fs.readFile(settingsPath, "utf8").catch(() => "");
  if (!settingsXml) return;

  const updatedXml = settingsXml.includes("<w:updateFields")
    ? settingsXml.replace(/<w:updateFields\b[^>]*w:val="[^"]*"[^/]*\/>/, '<w:updateFields w:val="true"/>')
    : settingsXml.replace("</w:settings>", '<w:updateFields w:val="true"/></w:settings>');

  await fs.writeFile(settingsPath, updatedXml, "utf8");
}

async function docxTargetExists(wordDir: string, target: string) {
  if (target.startsWith("http://") || target.startsWith("https://")) {
    return true;
  }

  return fs
    .access(path.resolve(wordDir, target))
    .then(() => true)
    .catch(() => false);
}

async function readDocxPackageState(tempDir: string, documentXml?: string) {
  const wordDir = path.join(tempDir, "word");
  const relsPath = path.join(wordDir, "_rels", "document.xml.rels");
  const relsXml = await fs.readFile(relsPath, "utf8").catch(() => "");
  const currentDocumentXml =
    documentXml ?? (await fs.readFile(path.join(wordDir, "document.xml"), "utf8").catch(() => ""));

  const relationships = [...relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Type="([^"]+)"[^>]*Target="([^"]+)"[^>]*/g)].map(
    (match) => ({
      id: match[1] ?? "",
      type: match[2] ?? "",
      target: match[3] ?? "",
    }),
  );

  const referencedIds = new Set<string>([
    ...[...currentDocumentXml.matchAll(/\br:id="([^"]+)"/g)].map((match) => match[1] ?? ""),
    ...[...currentDocumentXml.matchAll(/\br:embed="([^"]+)"/g)].map((match) => match[1] ?? ""),
    ...[...currentDocumentXml.matchAll(/\br:link="([^"]+)"/g)].map((match) => match[1] ?? ""),
  ]);
  const removableTypes = [
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject",
  ];

  return {
    wordDir,
    relsPath,
    relsXml,
    currentDocumentXml,
    relationships,
    referencedIds,
    removableTypes,
  };
}

async function repairDocxPackageRelations(tempDir: string, documentXml?: string): Promise<DocxRelationIntegrity> {
  const { wordDir, relsPath, relsXml, currentDocumentXml, relationships, referencedIds, removableTypes } =
    await readDocxPackageState(tempDir, documentXml);

  const missingTargets: string[] = [];
  const removedRelationshipIds: string[] = [];
  const keptTargets = new Set<string>();
  const relationshipEntries = [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)];
  const prefix = relationshipEntries[0]
    ? relsXml.slice(0, relationshipEntries[0].index)
    : relsXml;
  const suffix = relationshipEntries.length > 0
    ? relsXml.slice(
        (relationshipEntries[relationshipEntries.length - 1]?.index ?? 0) +
          (relationshipEntries[relationshipEntries.length - 1]?.[0].length ?? 0),
      )
    : "";
  const keptRelationshipXml: string[] = [];

  for (const relationship of relationships) {
    const localTarget = path.resolve(wordDir, relationship.target);
    const localExists = await docxTargetExists(wordDir, relationship.target);

    if (!localExists) {
      missingTargets.push(relationship.target);
    }

    const shouldRemove =
      !localExists ||
      (removableTypes.includes(relationship.type) && !referencedIds.has(relationship.id));

    if (shouldRemove) {
      removedRelationshipIds.push(relationship.id);
      continue;
    }

    keptRelationshipXml.push(
      `<Relationship Id="${relationship.id}" Type="${relationship.type}" Target="${relationship.target}"/>`,
    );
    if (/^(media|embeddings)\//.test(relationship.target)) {
      keptTargets.add(localTarget);
    }
  }

  const filteredRelsXml = relationshipEntries.length > 0
    ? `${prefix}${keptRelationshipXml.join("")}${suffix}`
    : relsXml;

  await fs.writeFile(relsPath, filteredRelsXml, "utf8");

  const removedMediaTargets: string[] = [];
  const removedEmbeddingTargets: string[] = [];
  const extractedFiles = await listExtractedFiles(wordDir);

  for (const filePath of extractedFiles) {
    if (!/[/\\](media|embeddings)[/\\]/.test(filePath)) continue;
    if (keptTargets.has(filePath)) continue;
    await fs.rm(filePath, { force: true });
    const relativeTarget = path.relative(wordDir, filePath).replace(/\\/g, "/");
    if (relativeTarget.startsWith("media/")) removedMediaTargets.push(relativeTarget);
    if (relativeTarget.startsWith("embeddings/")) removedEmbeddingTargets.push(relativeTarget);
  }

  return {
    missingTargets,
    removedRelationshipIds,
    removedMediaTargets,
    removedEmbeddingTargets,
    staleObjectCount: (currentDocumentXml.match(/<w:object/g) ?? []).length,
    isClean: missingTargets.length === 0,
  };
}

async function verifyDocxPackageRelations(tempDir: string, documentXml?: string): Promise<DocxRelationIntegrity> {
  const { wordDir, currentDocumentXml, relationships } = await readDocxPackageState(tempDir, documentXml);
  const missingTargets: string[] = [];

  for (const relationship of relationships) {
    const localExists = await docxTargetExists(wordDir, relationship.target);
    if (!localExists) {
      missingTargets.push(relationship.target);
    }
  }

  return {
    missingTargets,
    removedRelationshipIds: [],
    removedMediaTargets: [],
    removedEmbeddingTargets: [],
    staleObjectCount: (currentDocumentXml.match(/<w:object/g) ?? []).length,
    isClean: missingTargets.length === 0,
  };
}

function buildQualityReport(params: {
  buildResult: DocxTemplateBuildResult;
  finalDocumentXml: string;
  relationIntegrity: DocxRelationIntegrity;
}) {
  const sectionMetrics: DocxQualitySectionMetric[] = params.buildResult.sectionValues.map((section) => {
    const actualChars = countVisibleChars(section.content);
    const ratio = toRatio(actualChars, section.targetChars);
    return {
      sectionId: section.id,
      title: section.title,
      targetChars: section.targetChars,
      actualChars,
      ratio,
      required: section.required,
      usedFallback: section.usedFallback,
      withinRange: isRatioWithinRange(ratio, section.required, section.usedFallback),
    };
  });

  const featureMetrics: DocxQualitySectionMetric[] = params.buildResult.featureBlocks.map((feature) => {
    const actualChars =
      countVisibleChars(joinListAsParagraph(feature.processItems)) +
      countVisibleChars(joinListAsParagraph(feature.detailItems)) +
      countVisibleChars(joinListAsParagraph(feature.ruleItems)) +
      countVisibleChars(feature.inputRecords.map((record) => Object.values(record).join("")).join("")) +
      countVisibleChars(feature.outputRecords.map((record) => Object.values(record).join("")).join(""));
    const ratio = toRatio(actualChars, feature.targetChars);
    return {
      sectionId: `3.2.${feature.index}`,
      title: `业务功能${feature.index}`,
      targetChars: feature.targetChars,
      actualChars,
      ratio,
      required: true,
      usedFallback: feature.usedFallback,
      withinRange: isRatioWithinRange(ratio, true, feature.usedFallback),
    };
  });

  const requiredSectionCount =
    sectionMetrics.filter((metric) => metric.required).length + featureMetrics.length;
  const coveredSectionCount =
    sectionMetrics.filter((metric) => metric.required && metric.actualChars > 0).length +
    featureMetrics.filter((metric) => metric.actualChars > 0).length;

  return {
    profileId: params.buildResult.profile.id,
    structureCoverageRatio: requiredSectionCount === 0 ? 1 : Number((coveredSectionCount / requiredSectionCount).toFixed(2)),
    requiredSectionCount,
    coveredSectionCount,
    featureBlockCount: params.buildResult.featureBlocks.length,
    expectedFeatureBlockCount: params.buildResult.featureBlocks.length,
    sectionMetrics: [...sectionMetrics, ...featureMetrics],
    tableMetrics: params.buildResult.tableMetrics,
    placeholderResidualCount: countPlaceholderResiduals(params.finalDocumentXml),
    legacyContentHits: scanLegacyHits(extractXmlText(params.finalDocumentXml)),
    relationIntegrity: params.relationIntegrity,
  } satisfies DocxQualityReport;
}

export async function fillDocxTemplate(params: {
  templatePath: string;
  outputPath: string;
  placeholderValues: Record<string, string>;
  featureBlocks?: DocxFeatureBlockModel[];
  departmentRecords?: Array<{ department: string; duty: string }>;
  buildResult?: DocxTemplateBuildResult;
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reqagent-docx-template-"));
  const templatePath = path.resolve(params.templatePath);
  const outputPath = path.resolve(params.outputPath);

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await execa("unzip", ["-q", templatePath, "-d", tempDir]);
    const documentXmlPath = path.join(tempDir, "word", "document.xml");
    let documentXml = await fs.readFile(documentXmlPath, "utf8");

    if (params.featureBlocks && params.featureBlocks.length > 0) {
      documentXml = expandFeatureBlocks(documentXml, params.featureBlocks).documentXml;
    }

    if (params.departmentRecords && params.departmentRecords.length > 0) {
      documentXml = expandDepartmentRows(documentXml, params.departmentRecords);
    }

    documentXml = applyProfileDrivenShellTransforms(documentXml, params.buildResult);

    const normalizedPlaceholderValues = Object.fromEntries(
      Object.entries(params.placeholderValues)
        .map(([key, rawValue]) => [key, rawValue.trim()])
        .filter(([, value]) => Boolean(value)),
    );
    documentXml = replaceDocxPlaceholders(documentXml, normalizedPlaceholderValues, {
      stripResidualPlaceholders: true,
    });
    documentXml = removeLegacyDocxParagraphs(documentXml);
    documentXml = documentXml.replace(/\{\{[^{}]+\}\}/g, "");

    // Clean up empty XML elements left behind by unfilled placeholders
    documentXml = removeEmptyTableRows(documentXml);
    documentXml = removeEmptyParagraphs(documentXml);

    await fs.writeFile(documentXmlPath, documentXml, "utf8");
    const repairedRelationIntegrity = await repairDocxPackageRelations(tempDir, documentXml);
    const finalRelationIntegrityCheck = await verifyDocxPackageRelations(tempDir, documentXml);
    await enableUpdateFieldsOnOpen(tempDir);
    const relationIntegrity = {
      ...repairedRelationIntegrity,
      isClean: finalRelationIntegrityCheck.missingTargets.length === 0,
    };
    await fs.rm(outputPath, { force: true });
    await execa("zip", ["-qr", outputPath, "."], { cwd: tempDir });

    const qualityReport = params.buildResult
      ? buildQualityReport({
          buildResult: params.buildResult,
          finalDocumentXml: documentXml,
          relationIntegrity,
        })
      : undefined;

    return {
      qualityReport,
      relationIntegrity,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
