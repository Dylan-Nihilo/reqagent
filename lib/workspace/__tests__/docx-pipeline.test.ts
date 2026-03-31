import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { execa } from "execa";
import {
  analyzeDocxStructure,
  buildDocxTemplatePayload,
  expandDepartmentRows,
  fillDocxTemplate,
  removeEmptyParagraphs,
  removeEmptyTableRows,
} from "../docx-support";
import { DEFAULT_DOCX_TEMPLATE_PATH } from "../docx-template-path";

const PROCESS_DIR = path.join(process.cwd(), "test", "docx-pipeline");
const OUTPUT_PATH = path.join(PROCESS_DIR, "pipeline-output.docx");
const EXTRACT_DIR = path.join(PROCESS_DIR, "extracted");
const DEFAULT_PLACEHOLDER_SECTION_HEADINGS = [
  "支付系统",
  "回单系统",
  "报表",
  "询证函需求",
  "京智柜面需求",
  "核算引擎核算规则配置表",
  "对手信息",
  "通知类业务",
  "联网核查系统",
];

function resolveTemplatePath() {
  const candidates = [DEFAULT_DOCX_TEMPLATE_PATH];

  return candidates.find((candidate) => existsSync(candidate));
}

function stripXmlText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getBodyParagraphTexts(xml: string) {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((match) => stripXmlText(match[0] ?? ""))
    .filter(Boolean);
}

function getBodyFeatureParagraphs(xml: string) {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)]
    .map((match) => match[0] ?? "")
    .filter(
      (paragraphXml) =>
        /业务功能(?:[一二三四五六七八九十]|\d+)：/.test(paragraphXml) &&
        !paragraphXml.includes("PAGEREF"),
    )
    .map((paragraphXml) => stripXmlText(paragraphXml));
}

function findTablePreview(
  tables: Awaited<ReturnType<typeof analyzeDocxStructure>>["tables"],
  header: string[],
) {
  return tables.find(
    (table) =>
      JSON.stringify(table.previewRows[0] ?? []) === JSON.stringify(header),
  );
}

function getSectionContentAfterHeading(
  paragraphTexts: string[],
  heading: string,
  stopHeadings: string[],
) {
  const startIndex = paragraphTexts.findIndex((text) => text === heading);
  if (startIndex === -1) return "";

  const content: string[] = [];
  for (let index = startIndex + 1; index < paragraphTexts.length; index += 1) {
    const paragraphText = paragraphTexts[index] ?? "";
    if (stopHeadings.includes(paragraphText)) break;
    content.push(paragraphText);
  }

  return content.join(" ");
}

function buildBasicMarkdown() {
  return `# 基础章测试文档

# 需求背景
统一客户经营与智能推荐流程，减少人工规则配置成本。

# 业务目标
提升营销转化效率与规则配置稳定性。

# 业务价值
建立统一画像、统一推荐和统一评估口径。
`;
}

function buildSevenFeaturePipelineMarkdown() {
  return `# 智能推荐平台主管需求说明书

# 需求背景
本期建设目标为统一管理跨渠道经营场景下的客户画像与产品推荐能力。

# 业务目标
实现客户分层、精准营销和自动化推荐三大核心目标。

# 业务价值
提升转化率、降低人工运营成本、建立可量化的营销效果评估体系。

# 术语定义
| 术语 | 定义 |
|------|------|
| 客户画像 | 基于多维度数据构建的客户特征模型 |
| 推荐引擎 | 根据规则或算法生成个性化推荐的系统模块 |

# 业务概述
覆盖客户全生命周期的画像构建、策略编排与智能推荐场景。

# 项目参与部门及职责
| 部门名称 | 职责 |
|----------|------|
| 经营管理部 | 业务规则制定与验收 |
| 平台研发部 | 系统开发与运维 |
| 数据治理部 | 数据采集与治理 |

# 功能架构
客户画像管理；标签体系管理；推荐策略配置；推荐引擎；效果评估；白名单管理；运营看板

### 能力项：客户画像管理
#### 业务流程
1. 采集多维度客户数据
2. 清洗与标准化
3. 生成统一画像
#### 业务功能详述
支持客户基本信息、交易行为、渠道偏好等多维画像展示与查询。
#### 业务规则
- 画像更新频率不低于 T+1
- 数据来源需通过数据治理审核
#### 输入要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 客户号 | String | 是 | | 唯一标识 |
| 数据日期 | Date | 是 | | |
#### 输出要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 画像ID | String | 是 | | |
| 画像JSON | JSON | 是 | | 完整画像 |

### 能力项：标签体系管理
#### 业务流程
1. 定义标签分类
2. 配置标签规则
3. 自动打标
#### 业务功能详述
提供标签的创建、编辑、上下线和批量管理能力。
#### 业务规则
- 标签命名需唯一
- 支持手动标签与规则标签两种类型
#### 输入要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 标签名称 | String | 是 | | |
#### 输出要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 标签ID | String | 是 | | |

### 能力项：推荐策略配置
#### 业务流程
1. 选择目标客群
2. 配置推荐规则
3. 设置生效时间
#### 业务功能详述
运营人员可配置基于规则或模型的推荐策略。
#### 业务规则
- 每个场景至少配置一条策略
- 策略生效需审批
#### 输入要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 场景ID | String | 是 | | |
#### 输出要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 策略ID | String | 是 | | |

### 能力项：推荐引擎
#### 业务流程
1. 接收推荐请求
2. 匹配策略规则
3. 返回推荐结果
#### 业务功能详述
实时计算并返回个性化推荐列表。
#### 业务规则
- 响应时间不超过 200ms
- 支持 A/B 测试分流
#### 输入要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 客户号 | String | 是 | | |
| 场景码 | String | 是 | | |
#### 输出要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 推荐列表 | Array | 是 | | |

### 能力项：效果评估
#### 业务流程
1. 采集曝光与点击数据
2. 计算转化指标
3. 生成评估报告
#### 业务功能详述
提供推荐效果的多维度分析与可视化看板。
#### 业务规则
- 评估周期支持日/周/月
- 指标包括 CTR、CVR、GMV
#### 输入要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 评估周期 | String | 是 | 日/周/月 | |
#### 输出要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 报告ID | String | 是 | | |

### 能力项：白名单管理
#### 业务流程
1. 导入白名单
2. 关联推荐策略
3. 定期清理过期名单
#### 业务功能详述
支持按客户号、客群维度维护白名单，控制推荐触达范围。
#### 业务规则
- 白名单条目需设置有效期
- 支持批量导入导出
#### 输入要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 客户号列表 | Array | 是 | | |
#### 输出要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 导入结果 | Object | 是 | | |

### 能力项：运营看板
#### 业务流程
1. 汇总运营数据
2. 生成可视化图表
3. 支持下钻分析
#### 业务功能详述
为运营人员提供实时的推荐运营数据监控大屏。
#### 业务规则
- 数据刷新频率不低于 5 分钟
- 支持自定义看板布局
#### 输入要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 时间范围 | DateRange | 是 | | |
#### 输出要素
| 字段 | 类型 | 是否必填 | 枚举值 | 备注 |
|------|------|----------|--------|------|
| 看板数据 | Object | 是 | | |
`;
}

const templatePath = resolveTemplatePath();
const hasTemplate = Boolean(templatePath);
const templateDescribe = hasTemplate ? describe : describe.skip;

describe("Docx Pipeline - Pure Functions", () => {
  describe("Group 1: buildDocxTemplatePayload", () => {
    it("1.1 maps basic chapter placeholders", () => {
      const result = buildDocxTemplatePayload(buildBasicMarkdown(), "基础章测试文档");

      expect(result.placeholderValues["需求背景"]).toBeTruthy();
      expect(result.placeholderValues["业务目标"]).toBeTruthy();
      expect(result.placeholderValues["业务价值"]).toBeTruthy();
      expect(result.placeholderValues["需求背景"]).not.toContain("{{");
    });

    it("1.2 parses seven feature blocks with non-empty structured content", () => {
      const result = buildDocxTemplatePayload(
        buildSevenFeaturePipelineMarkdown(),
        "智能推荐平台主管需求说明书",
      );

      expect(result.featureBlocks).toHaveLength(7);
      expect(result.functionCatalogRecords).toHaveLength(7);
      result.featureBlocks.forEach((featureBlock) => {
        expect(featureBlock.processItems.length).toBeGreaterThan(0);
        expect(featureBlock.detailItems.length).toBeGreaterThan(0);
        expect(featureBlock.ruleItems.length).toBeGreaterThan(0);
      });
    });

    it("1.3 parses department records from markdown table", () => {
      const result = buildDocxTemplatePayload(
        buildSevenFeaturePipelineMarkdown(),
        "智能推荐平台主管需求说明书",
      );

      expect(result.departmentRecords).toHaveLength(3);
      expect(result.departmentRecords.map((record) => record.department)).toEqual([
        "经营管理部",
        "平台研发部",
        "数据治理部",
      ]);
    });

    it("1.4 uses fallback text for required sections when markdown is empty", () => {
      const result = buildDocxTemplatePayload("# 空白文档", "空白文档");
      const requiredContracts = new Map(
        result.profile.sectionContracts
          .filter((contract) => contract.required)
          .map((contract) => [contract.id, contract]),
      );

      const requiredSections = result.sectionValues.filter((section) =>
        requiredContracts.has(section.id),
      );
      const nonFallbackSections = requiredSections
        .filter((section) => !section.usedFallback)
        .map((section) => section.id);

      expect(requiredSections.length).toBeGreaterThan(0);
      expect(nonFallbackSections).toEqual([]);
      requiredSections.forEach((section) => {
        const contract = requiredContracts.get(section.id);
        expect(section.usedFallback).toBe(true);
        expect(section.content).toBe(contract?.fallbackText);
      });
    });

    it("1.5 removes legacy terms from placeholder values", () => {
      const dirtyMarkdown = `# 脏内容清洗测试

# 需求背景
零售水晶球用于新增代发管理场景。

# 业务目标
保留结构，但清除旧项目名。
`;
      const result = buildDocxTemplatePayload(dirtyMarkdown, "脏内容清洗测试");
      const values = Object.values(result.placeholderValues).join("\n");

      expect(values).not.toContain("零售水晶球");
      expect(values).not.toContain("新增代发管理");
    });
  });

  describe("Group 2: removeEmptyTableRows", () => {
    it("2.1 removes fully empty rows", () => {
      const xml = '<w:tr><w:tc><w:p><w:pPr/></w:p></w:tc></w:tr>';
      expect(removeEmptyTableRows(xml)).toBe("");
    });

    it("2.2 preserves rows with visible text", () => {
      const xml = '<w:tr><w:tc><w:p><w:r><w:t>数据</w:t></w:r></w:p></w:tc></w:tr>';
      expect(removeEmptyTableRows(xml)).toBe(xml);
    });

    it("2.3 preserves rows containing nested tables", () => {
      const xml = '<w:tr><w:tc><w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl></w:tc></w:tr>';
      expect(removeEmptyTableRows(xml)).toBe(xml);
    });
  });

  describe("Group 3: removeEmptyParagraphs", () => {
    it("3.1 removes empty paragraphs outside tables", () => {
      expect(removeEmptyParagraphs("<w:p><w:pPr/></w:p>")).toBe("");
    });

    it("3.2 preserves empty paragraphs inside tables", () => {
      const xml = "<w:tbl><w:tr><w:tc><w:p/></w:tc></w:tr></w:tbl>";
      expect(removeEmptyParagraphs(xml)).toBe(xml);
    });

    it("3.3 preserves page break paragraphs", () => {
      const xml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      expect(removeEmptyParagraphs(xml)).toBe(xml);
    });

    it("3.4 preserves field-code paragraphs", () => {
      const xml = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r></w:p>';
      expect(removeEmptyParagraphs(xml)).toBe(xml);
    });

    it("3.5 preserves drawing paragraphs", () => {
      const xml = "<w:p><w:r><w:drawing/></w:r></w:p>";
      expect(removeEmptyParagraphs(xml)).toBe(xml);
    });

    it("3.6 preserves VML image paragraphs", () => {
      const xml = "<w:p><w:r><w:pict/></w:r></w:p>";
      expect(removeEmptyParagraphs(xml)).toBe(xml);
    });
  });

  describe("Group 4: expandDepartmentRows", () => {
    const departmentTableXml = [
      "<w:tbl>",
      '<w:tr><w:tc><w:p><w:r><w:t>部门名称</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>职责</w:t></w:r></w:p></w:tc></w:tr>',
      '<w:tr><w:tc><w:p><w:r><w:t>{{部门1}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{职责1}}</w:t></w:r></w:p></w:tc></w:tr>',
      "</w:tbl>",
    ].join("");

    it("4.1 expands three department rows", () => {
      const xml = expandDepartmentRows(departmentTableXml, [
        { department: "经营管理部", duty: "业务规则制定与验收" },
        { department: "平台研发部", duty: "系统开发与运维" },
        { department: "数据治理部", duty: "数据采集与治理" },
      ]);

      expect((xml.match(/<w:tr\b/g) ?? []).length).toBe(4);
      expect(xml).toContain("经营管理部");
      expect(xml).toContain("平台研发部");
      expect(xml).toContain("数据治理部");
    });

    it("4.2 returns original xml for empty records", () => {
      expect(expandDepartmentRows(departmentTableXml, [])).toBe(departmentTableXml);
    });

    it("4.3 returns original xml when anchor row is missing", () => {
      const xml = "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>部门名称</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";
      expect(expandDepartmentRows(xml, [{ department: "A", duty: "B" }])).toBe(xml);
    });
  });
});

templateDescribe("Docx Pipeline - Integration And Package", () => {
  const fixtureMarkdown = buildSevenFeaturePipelineMarkdown();
  let fixtureBuildResult: ReturnType<typeof buildDocxTemplatePayload>;
  let outputXml = "";
  let relationshipXml = "";
  let qualityReport: Awaited<ReturnType<typeof fillDocxTemplate>>["qualityReport"];
  let analysis: Awaited<ReturnType<typeof analyzeDocxStructure>>;

  beforeAll(async () => {
    await fs.mkdir(PROCESS_DIR, { recursive: true });
    const existingEntries = await fs.readdir(PROCESS_DIR).catch(() => []);
    for (const entry of existingEntries) {
      if (entry === ".gitkeep") continue;
      await fs.rm(path.join(PROCESS_DIR, entry), { recursive: true, force: true });
    }

    fixtureBuildResult = buildDocxTemplatePayload(
      fixtureMarkdown,
      "智能推荐平台主管需求说明书",
      {
        author: "ReqAgent",
        version: "V1.0",
        docDate: "2026/03/26",
      },
    );

    const fillResult = await fillDocxTemplate({
      templatePath: templatePath!,
      outputPath: OUTPUT_PATH,
      placeholderValues: fixtureBuildResult.placeholderValues,
      featureBlocks: fixtureBuildResult.featureBlocks,
      departmentRecords: fixtureBuildResult.departmentRecords,
      buildResult: fixtureBuildResult,
    });

    qualityReport = fillResult.qualityReport;

    await execa("unzip", ["-q", OUTPUT_PATH, "-d", EXTRACT_DIR]);
    outputXml = await fs.readFile(path.join(EXTRACT_DIR, "word", "document.xml"), "utf8");
    relationshipXml = await fs.readFile(
      path.join(EXTRACT_DIR, "word", "_rels", "document.xml.rels"),
      "utf8",
    );
    analysis = await analyzeDocxStructure(OUTPUT_PATH);
  });

  describe("Group 5: fillDocxTemplate", () => {
    it("5.1 produces a readable docx file", async () => {
      const stat = await fs.stat(OUTPUT_PATH);
      expect(stat.size).toBeGreaterThan(10 * 1024);
    });

    it("5.2 expands all seven feature blocks", () => {
      const featureParagraphs = getBodyFeatureParagraphs(outputXml);

      expect(featureParagraphs).toHaveLength(7);
      expect(featureParagraphs[0]).toContain("3.2.1 业务功能一：客户画像管理");
      expect(featureParagraphs[1]).toContain("3.2.2 业务功能二：标签体系管理");
      expect(featureParagraphs[2]).toContain("3.2.3 业务功能三：推荐策略配置");
      expect(featureParagraphs[3]).toContain("3.2.4 业务功能四：推荐引擎");
      expect(featureParagraphs[4]).toContain("3.2.5 业务功能五：效果评估");
      expect(featureParagraphs[5]).toContain("3.2.6 业务功能六：白名单管理");
      expect(featureParagraphs[6]).toContain("3.2.7 业务功能七：运营看板");
    });

    it("5.3 renders the terms section as a real two-column table", () => {
      const table = findTablePreview(analysis.tables, ["术语", "定义"]);

      expect(table?.previewRows[1]).toEqual([
        "客户画像",
        "基于多维度数据构建的客户特征模型",
      ]);
      expect(table?.previewRows[2]).toEqual([
        "推荐引擎",
        "根据规则或算法生成个性化推荐的系统模块",
      ]);
    });

    it("5.4 renders the function catalog as a formal table", () => {
      const table = findTablePreview(analysis.tables, ["序号", "功能模块", "功能名称", "备注"]);

      expect(table).toBeTruthy();
      expect(table?.previewRows[1]?.[1]).toBe("核心功能");
      expect(table?.previewRows[1]?.[2]).toBe("客户画像管理");
    });

    it("5.5 expands department rows", () => {
      expect(outputXml).toContain("经营管理部");
      expect(outputXml).toContain("平台研发部");
      expect(outputXml).toContain("数据治理部");
    });

    it("5.6 resets feature-local numbering and keeps chapter numbering correct", () => {
      const paragraphTexts = getBodyParagraphTexts(outputXml);

      expect(outputXml).toContain("3.2.1.1 业务流程");
      expect(outputXml).toContain("3.2.2.1 业务流程");
      expect(outputXml).toContain("1、采集多维度客户数据");
      expect(outputXml).toContain("1、定义标签分类");
      expect(
        paragraphTexts.some((text) => text.includes("第4章") && text.includes("数据要求")),
      ).toBe(true);
      expect(
        paragraphTexts.some((text) => text.includes("第5章") && text.includes("非功能及系统级需求")),
      ).toBe(true);
      expect(
        paragraphTexts.some((text) => text.includes("3.4") && text.includes("是否涉及使用外部数据")),
      ).toBe(false);
      expect(
        paragraphTexts.some((text) => text.includes("3.10") && text.includes("系统需求")),
      ).toBe(false);
    });

    it("5.7 keeps 4.1-4.15 complete", () => {
      const paragraphTexts = getBodyParagraphTexts(outputXml);

      [
        "4.1 是否涉及使用外部数据",
        "4.2 外部数据是否含有与客户有关的信息",
        "4.3 是否涉及监管报送",
        "4.4 是否落实数据分级分类管控要求",
        "4.5 数据挖掘分析需求",
        "4.6 是否差异化设置 “最小必要”数据权限",
        "4.7 是否涉及数据对外提供",
        "4.8 是否涉及处理3级及以上数据",
        "4.9 是否涉及以下数据处理场景（多选）",
        "4.10 是否涉及数据安全影响评估",
        "4.11 是否明确数据最短存储时间",
        "4.12 是否明确数据备份与恢复要求",
        "4.13 是否明确数据操作日志记录要求",
        "4.14 是否明确数据安全风险监测范围与要求",
        "4.15 是否审查模型开发加工目的与收集目的一致性",
      ].forEach((heading) => {
        const [indexPrefix, ...titleParts] = heading.split(" ");
        const title = titleParts.join(" ");
        expect(
          paragraphTexts.some(
            (text) => text.includes(indexPrefix ?? "") && text.includes(title),
          ),
        ).toBe(true);
      });
    });

    it("5.8 leaves no placeholder residuals", () => {
      expect((outputXml.match(/\{\{/g) ?? []).length).toBe(0);
    });

    it("5.9 removes legacy dirty content", () => {
      expect(outputXml).not.toContain("零售水晶球");
      expect(outputXml).not.toContain("新增代发管理");
      expect(outputXml).not.toContain("注意：此项必填");
      expect(outputXml).not.toContain("数据流向如下流程图");
      expect(outputXml).not.toContain("SR_");
    });

    it("5.10 keeps default placeholder body for missing special sections", () => {
      const paragraphTexts = getBodyParagraphTexts(outputXml);

      DEFAULT_PLACEHOLDER_SECTION_HEADINGS.forEach((heading, index) => {
        const stopHeadings = DEFAULT_PLACEHOLDER_SECTION_HEADINGS.slice(index + 1);
        const sectionText = getSectionContentAfterHeading(paragraphTexts, heading, stopHeadings);
        expect(sectionText).toContain("本期不涉及");
      });
    });

    it("5.11 makes 5.1 and 5.2 substantial", () => {
      const paragraphTexts = getBodyParagraphTexts(outputXml);
      const nonFunctional = getSectionContentAfterHeading(paragraphTexts, "非功能性需求", ["系统需求"]);
      const system = getSectionContentAfterHeading(paragraphTexts, "系统需求", ["参考资料"]);

      expect(nonFunctional.length).toBeGreaterThan(40);
      expect(system.length).toBeGreaterThan(40);
    });
  });

  describe("Group 6: quality report", () => {
    it("6.1 keeps structure coverage above threshold", () => {
      expect(qualityReport?.structureCoverageRatio ?? 0).toBeGreaterThanOrEqual(0.8);
    });

    it("6.2 reports the correct feature block count", () => {
      expect(qualityReport?.featureBlockCount).toBe(7);
    });

    it("6.3 reports zero placeholder residuals", () => {
      expect(qualityReport?.placeholderResidualCount).toBe(0);
    });

    it("6.4 reports zero legacy content hits", () => {
      qualityReport?.legacyContentHits.forEach((hit) => {
        expect(hit.count).toBe(0);
      });
    });

    it("6.5 reports clean relationship integrity", () => {
      expect(qualityReport?.relationIntegrity.isClean).toBe(true);
    });

    it("6.6 keeps non-fallback required sections non-empty without over-padding", () => {
      const metrics =
        qualityReport?.sectionMetrics.filter(
          (metric) =>
            metric.required &&
            !metric.usedFallback &&
            !metric.sectionId.startsWith("3.2."),
        ) ?? [];

      expect(metrics.length).toBeGreaterThan(0);
      metrics.forEach((metric) => {
        expect(metric.actualChars).toBeGreaterThan(0);
        expect(metric.ratio).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("Group 7: docx package integrity", () => {
    it("7.1 validates the zip package", async () => {
      await execa("unzip", ["-t", OUTPUT_PATH]);
    });

    it("7.2 keeps core OOXML files", async () => {
      await expect(fs.access(path.join(EXTRACT_DIR, "word", "document.xml"))).resolves.toBeUndefined();
      await expect(fs.access(path.join(EXTRACT_DIR, "word", "styles.xml"))).resolves.toBeUndefined();
      await expect(fs.access(path.join(EXTRACT_DIR, "[Content_Types].xml"))).resolves.toBeUndefined();
    });

    it("7.3 leaves no orphan relationships", async () => {
      const relationships = [
        ...relationshipXml.matchAll(
          /<Relationship\b[^>]*Target="([^"]+)"[^>]*\/>/g,
        ),
      ].map((match) => match[1] ?? "");

      for (const target of relationships) {
        if (target.startsWith("http://") || target.startsWith("https://")) continue;
        const resolvedTarget = path.resolve(EXTRACT_DIR, "word", target);
        await expect(fs.access(resolvedTarget)).resolves.toBeUndefined();
      }
    });

    it("7.4 strips OLE object tags", () => {
      expect(outputXml).not.toContain("<w:object");
    });

    it("7.5 stays parseable by analyzeDocxStructure", async () => {
      const analysis = await analyzeDocxStructure(OUTPUT_PATH);
      expect(analysis.headings.length).toBeGreaterThan(0);
    });
  });
});
