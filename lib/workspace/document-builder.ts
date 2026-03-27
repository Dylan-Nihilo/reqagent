import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  resolveDocxTemplateProfile,
  type DocxSectionContract,
  type DocxTemplateProfile,
} from "@/lib/workspace/docx-support";

const DOCBUILDER_DIRNAME = ".docbuilder";
const DOCX_MIN_RATIO = 0.7;
const DOCX_MAX_RATIO = 1;
const FEATURE_SECTION_INSERT_AFTER = "3.1";

type DocumentMetadata = {
  title: string;
  author?: string;
  version?: string;
  organization?: string;
  created_at: string;
  updated_at: string;
};

type FeatureFieldRecord = {
  field: string;
  type: string;
  required: string;
  enum_values: string;
  note: string;
};

type FeatureBlockContent = {
  index: number;
  name: string;
  process_items: string[];
  detail_items: string[];
  rule_items: string[];
  input_table?: FeatureFieldRecord[];
  output_table?: FeatureFieldRecord[];
};

type DepartmentRecord = {
  department: string;
  duty: string;
};

type TermRecord = {
  term: string;
  definition: string;
};

type PersistedDocumentBuilder = {
  id: string;
  template_profile_id: string;
  metadata: DocumentMetadata;
  sections: Array<[string, SectionContent]>;
  feature_blocks: Array<[number, FeatureBlockContent]>;
  department_records: DepartmentRecord[];
  term_records: TermRecord[];
};

export type InitDocumentOpts = {
  id?: string;
  title: string;
  template_profile_id?: string;
  author?: string;
  version?: string;
  organization?: string;
  created_at?: string;
  updated_at?: string;
};

export type SectionContent = {
  markdown: string;
  feature_block?: FeatureBlockContent;
  department_records?: DepartmentRecord[];
  term_records?: TermRecord[];
};

export type SectionFillResult = {
  section_id: string;
  status: "filled";
  actual_chars: number;
  target_chars: number;
  ratio: number;
  within_range: boolean;
};

export type DocumentStatus = {
  document_id: string;
  title: string;
  status: "drafting" | "complete";
  filled: Array<{
    section_id: string;
    title: string;
    chars: number;
    ratio: number;
  }>;
  pending: Array<{
    section_id: string;
    title: string;
    target_chars: number;
    required: boolean;
  }>;
  feature_blocks: {
    filled: number;
    total: number;
  };
  total_chars: number;
  total_target_chars: number;
  completion_ratio: number;
};

export class DocumentBuilder {
  readonly id: string;
  readonly workspaceDir: string;

  private readonly profile: DocxTemplateProfile;
  private metadata: DocumentMetadata;
  private sections = new Map<string, SectionContent>();
  private featureBlocks = new Map<number, FeatureBlockContent>();
  private departmentRecords: DepartmentRecord[] = [];
  private termRecords: TermRecord[] = [];

  constructor(workspaceDir: string, opts: InitDocumentOpts) {
    this.workspaceDir = path.resolve(workspaceDir);
    this.id = validateDocumentId(opts.id) ?? randomUUID();
    this.profile = resolveDocxTemplateProfile(opts.template_profile_id);

    const created_at = normalizeOptionalText(opts.created_at) ?? nowIsoString();
    this.metadata = {
      title: normalizeRequiredText(opts.title, "Document title is required"),
      author: normalizeOptionalText(opts.author),
      version: normalizeOptionalText(opts.version),
      organization: normalizeOptionalText(opts.organization),
      created_at,
      updated_at: normalizeOptionalText(opts.updated_at) ?? created_at,
    };
  }

  getMetadata() {
    return { ...this.metadata };
  }

  getTemplateProfile() {
    return this.profile;
  }

  getOutline() {
    return this.profile.sectionContracts.map((contract) => ({
      section_id: contract.id,
      title: contract.title,
      required: contract.required,
      target_chars: contract.targetChars,
      status: this.getSectionCharCount(contract.id) > 0 ? ("filled" as const) : ("pending" as const),
      content_types: [...contract.contentTypes],
    }));
  }

  fillSection(sectionId: string, content: SectionContent): SectionFillResult {
    const contract = this.getSectionContract(sectionId);
    const normalizedContent = normalizeSectionContent(content);

    if (hasSectionPayload(normalizedContent)) {
      this.sections.set(sectionId, normalizedContent);
    } else {
      this.sections.delete(sectionId);
    }

    if (normalizedContent.feature_block) {
      this.storeFeatureBlock(normalizedContent.feature_block, false);
    }

    if (sectionId === "2.4") {
      this.departmentRecords = normalizedContent.department_records ?? [];
    }

    if (sectionId === "1.4") {
      this.termRecords = normalizedContent.term_records ?? [];
    }

    this.touch();

    const actual_chars = this.getSectionCharCount(sectionId);
    const ratio = toRatio(actual_chars, contract.targetChars);

    return {
      section_id: contract.id,
      status: "filled",
      actual_chars,
      target_chars: contract.targetChars,
      ratio,
      within_range: isWithinRange(ratio),
    };
  }

  addFeatureBlock(block: FeatureBlockContent) {
    this.storeFeatureBlock(block, true);
  }

  getStatus(): DocumentStatus {
    const filled = this.profile.sectionContracts
      .map((contract) => {
        const chars = this.getSectionCharCount(contract.id);
        if (chars === 0) return null;

        return {
          section_id: contract.id,
          title: contract.title,
          chars,
          ratio: toRatio(chars, contract.targetChars),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const pending = this.profile.sectionContracts
      .filter((contract) => this.getSectionCharCount(contract.id) === 0)
      .map((contract) => ({
        section_id: contract.id,
        title: contract.title,
        target_chars: contract.targetChars,
        required: contract.required,
      }));

    const requiredSections = this.profile.sectionContracts.filter((contract) => contract.required);
    const filledRequiredCount = requiredSections.filter((contract) => this.getSectionCharCount(contract.id) > 0).length;
    const totalTargetChars =
      this.profile.sectionContracts.reduce((sum, contract) => sum + contract.targetChars, 0) +
      this.featureBlocks.size * this.profile.featureBlock.targetChars;

    return {
      document_id: this.id,
      title: this.metadata.title,
      status: this.isComplete() ? "complete" : "drafting",
      filled,
      pending,
      feature_blocks: {
        filled: this.featureBlocks.size,
        total: this.featureBlocks.size,
      },
      total_chars: this.getTotalChars(),
      total_target_chars: totalTargetChars,
      completion_ratio: toRatio(filledRequiredCount, requiredSections.length),
    };
  }

  isComplete() {
    return this.profile.sectionContracts
      .filter((contract) => contract.required)
      .every((contract) => this.getSectionCharCount(contract.id) > 0);
  }

  toMarkdown() {
    const lines = [`# ${this.metadata.title}`, ""];

    for (const contract of this.profile.sectionContracts) {
      lines.push(`${"#".repeat(this.getHeadingLevel(contract.id))} ${contract.id} ${contract.title}`);

      const body = this.renderSectionBody(contract);
      if (body) {
        lines.push("", body);
      }

      lines.push("");

      if (contract.id === FEATURE_SECTION_INSERT_AFTER) {
        const featureMarkdown = this.renderFeatureBlocks();
        if (featureMarkdown) {
          lines.push(featureMarkdown, "");
        }
      }
    }

    return trimTrailingBlankLines(lines).join("\n");
  }

  async save() {
    const outputPath = DocumentBuilder.getStatePath(this.workspaceDir, this.id);
    const payload: PersistedDocumentBuilder = {
      id: this.id,
      template_profile_id: this.profile.id,
      metadata: this.metadata,
      sections: [...this.sections.entries()],
      feature_blocks: [...this.featureBlocks.entries()],
      department_records: this.departmentRecords,
      term_records: this.termRecords,
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
  }

  static async load(workspaceDir: string, id: string) {
    const validatedId = validateDocumentId(id);
    if (!validatedId) {
      throw new Error(`Invalid document builder id: ${id}`);
    }

    const statePath = DocumentBuilder.getStatePath(workspaceDir, validatedId);
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedDocumentBuilder>;

    const metadata = parsed.metadata;
    if (!metadata?.title) {
      throw new Error(`Document builder state is invalid: ${statePath}`);
    }

    const builder = new DocumentBuilder(workspaceDir, {
      id: parsed.id ?? validatedId,
      title: metadata.title,
      template_profile_id: parsed.template_profile_id,
      author: metadata.author,
      version: metadata.version,
      organization: metadata.organization,
      created_at: metadata.created_at,
      updated_at: metadata.updated_at,
    });

    builder.sections = new Map(
      (parsed.sections ?? []).map(([sectionId, content]) => [sectionId, normalizeSectionContent(content)]),
    );
    builder.featureBlocks = new Map(
      (parsed.feature_blocks ?? []).map(([index, block]) => [index, normalizeFeatureBlock(block)]),
    );
    builder.departmentRecords = normalizeDepartmentRecords(parsed.department_records);
    builder.termRecords = normalizeTermRecords(parsed.term_records);

    return builder;
  }

  private storeFeatureBlock(block: FeatureBlockContent, updateTimestamp: boolean) {
    const normalizedBlock = normalizeFeatureBlock(block);
    this.featureBlocks.set(normalizedBlock.index, normalizedBlock);

    if (updateTimestamp) {
      this.touch();
    }
  }

  private getSectionContract(sectionId: string) {
    const contract = this.profile.sectionContracts.find((entry) => entry.id === sectionId);
    if (!contract) {
      throw new Error(`Unknown section id: ${sectionId}`);
    }

    return contract;
  }

  private getHeadingLevel(sectionId: string) {
    return Math.min(6, Math.max(2, sectionId.split(".").length + 1));
  }

  private getSectionCharCount(sectionId: string) {
    const section = this.sections.get(sectionId);
    const markdownChars = countVisibleChars(section?.markdown ?? "");

    if (sectionId === "1.4") {
      return markdownChars + countTermRecordChars(this.termRecords);
    }

    if (sectionId === "2.4") {
      return markdownChars + countDepartmentRecordChars(this.departmentRecords);
    }

    return markdownChars;
  }

  private getTotalChars() {
    const sectionChars = this.profile.sectionContracts.reduce(
      (sum, contract) => sum + this.getSectionCharCount(contract.id),
      0,
    );
    const featureChars = [...this.featureBlocks.values()].reduce(
      (sum, block) => sum + countFeatureBlockChars(block),
      0,
    );

    return sectionChars + featureChars;
  }

  private renderSectionBody(contract: DocxSectionContract) {
    const section = this.sections.get(contract.id);
    const blocks = [section?.markdown?.trim() ?? ""].filter(Boolean);

    if (contract.id === "1.4" && this.termRecords.length > 0) {
      blocks.push(renderTermsTable(this.termRecords));
    }

    if (contract.id === "2.4" && this.departmentRecords.length > 0) {
      blocks.push(renderDepartmentTable(this.departmentRecords));
    }

    return blocks.join("\n\n").trim();
  }

  private renderFeatureBlocks() {
    return [...this.featureBlocks.values()]
      .sort((left, right) => left.index - right.index)
      .map((block) => renderFeatureBlock(block))
      .join("\n\n");
  }

  private touch() {
    this.metadata.updated_at = nowIsoString();
  }

  private static getStatePath(workspaceDir: string, id: string) {
    return path.join(path.resolve(workspaceDir), DOCBUILDER_DIRNAME, `${id}.json`);
  }
}

function validateDocumentId(value?: string) {
  if (!value) return undefined;

  const normalizedValue = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedValue)) {
    throw new Error(`Invalid document builder id: ${value}`);
  }

  return normalizedValue;
}

function normalizeSectionContent(content: SectionContent) {
  const normalizedContent: SectionContent = {
    markdown: normalizeMultilineText(content.markdown),
  };

  if (content.feature_block) {
    normalizedContent.feature_block = normalizeFeatureBlock(content.feature_block);
  }

  if (content.department_records) {
    normalizedContent.department_records = normalizeDepartmentRecords(content.department_records);
  }

  if (content.term_records) {
    normalizedContent.term_records = normalizeTermRecords(content.term_records);
  }

  return normalizedContent;
}

function hasSectionPayload(content: SectionContent) {
  return Boolean(
    content.markdown ||
      content.feature_block ||
      content.department_records?.length ||
      content.term_records?.length,
  );
}

function normalizeFeatureBlock(block: FeatureBlockContent): FeatureBlockContent {
  const index = Number(block.index);
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Feature block index must be a positive integer: ${block.index}`);
  }

  return {
    index,
    name: normalizeRequiredText(block.name, "Feature block name is required"),
    process_items: normalizeStringArray(block.process_items),
    detail_items: normalizeStringArray(block.detail_items),
    rule_items: normalizeStringArray(block.rule_items),
    input_table: block.input_table ? normalizeFeatureFieldRecords(block.input_table) : undefined,
    output_table: block.output_table ? normalizeFeatureFieldRecords(block.output_table) : undefined,
  };
}

function normalizeFeatureFieldRecords(records?: FeatureFieldRecord[]) {
  return (records ?? [])
    .map((record) => ({
      field: normalizeRequiredText(record.field, "Feature table field is required"),
      type: normalizeOptionalText(record.type) ?? "-",
      required: normalizeOptionalText(record.required) ?? "-",
      enum_values: normalizeOptionalText(record.enum_values) ?? "-",
      note: normalizeOptionalText(record.note) ?? "-",
    }))
    .filter((record) => Boolean(record.field));
}

function normalizeDepartmentRecords(records?: DepartmentRecord[]) {
  return (records ?? [])
    .map((record) => ({
      department: normalizeRequiredText(record.department, "Department name is required"),
      duty: normalizeRequiredText(record.duty, "Department duty is required"),
    }))
    .filter((record) => Boolean(record.department) && Boolean(record.duty));
}

function normalizeTermRecords(records?: TermRecord[]) {
  return (records ?? [])
    .map((record) => ({
      term: normalizeRequiredText(record.term, "Term is required"),
      definition: normalizeRequiredText(record.definition, "Term definition is required"),
    }))
    .filter((record) => Boolean(record.term) && Boolean(record.definition));
}

function normalizeStringArray(values?: string[]) {
  return (values ?? []).map(normalizeOptionalText).filter((value): value is string => Boolean(value));
}

function normalizeRequiredText(value: string | undefined, errorMessage: string) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw new Error(errorMessage);
  }

  return normalized;
}

function normalizeOptionalText(value?: string) {
  const normalized = normalizeMultilineText(value ?? "");
  return normalized || undefined;
}

function normalizeMultilineText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

function countVisibleChars(value: string) {
  return value.replace(/\s+/g, "").trim().length;
}

function countFeatureBlockChars(block: FeatureBlockContent) {
  return countVisibleChars(block.name) +
    block.process_items.reduce((sum, item) => sum + countVisibleChars(item), 0) +
    block.detail_items.reduce((sum, item) => sum + countVisibleChars(item), 0) +
    block.rule_items.reduce((sum, item) => sum + countVisibleChars(item), 0) +
    (block.input_table ?? []).reduce((sum, record) => sum + countFeatureFieldRecordChars(record), 0) +
    (block.output_table ?? []).reduce((sum, record) => sum + countFeatureFieldRecordChars(record), 0);
}

function countFeatureFieldRecordChars(record: FeatureFieldRecord) {
  return countVisibleChars(
    `${record.field}${record.type}${record.required}${record.enum_values}${record.note}`,
  );
}

function countDepartmentRecordChars(records: DepartmentRecord[]) {
  return records.reduce((sum, record) => sum + countVisibleChars(`${record.department}${record.duty}`), 0);
}

function countTermRecordChars(records: TermRecord[]) {
  return records.reduce((sum, record) => sum + countVisibleChars(`${record.term}${record.definition}`), 0);
}

function toRatio(actual: number, target: number) {
  if (target <= 0) return actual > 0 ? 1 : 0;
  return Number((actual / target).toFixed(2));
}

function isWithinRange(ratio: number) {
  return ratio >= DOCX_MIN_RATIO && ratio <= DOCX_MAX_RATIO;
}

function renderTermsTable(records: TermRecord[]) {
  return renderMarkdownTable(["术语", "定义"], records.map((record) => [record.term, record.definition]));
}

function renderDepartmentTable(records: DepartmentRecord[]) {
  return renderMarkdownTable(["部门", "职责"], records.map((record) => [record.department, record.duty]));
}

function renderFeatureBlock(block: FeatureBlockContent) {
  const lines = [
    `### 3.2.${block.index} 业务功能${toChineseFeatureLabel(block.index)}：${block.name}`,
    "",
    `#### 3.2.${block.index}.1 业务流程`,
    "",
    renderMarkdownList(block.process_items, true),
    "",
    `#### 3.2.${block.index}.2 业务功能详述`,
    "",
    renderMarkdownList(block.detail_items, false),
    "",
    `#### 3.2.${block.index}.3 业务规则`,
    "",
    renderMarkdownList(block.rule_items, false),
  ];

  if ((block.input_table?.length ?? 0) > 0 || (block.output_table?.length ?? 0) > 0) {
    lines.push("", `#### 3.2.${block.index}.4 输入和输出`, "");

    if ((block.input_table?.length ?? 0) > 0) {
      lines.push("##### 输入要素", "", renderFeatureTable(block.input_table ?? []), "");
    }

    if ((block.output_table?.length ?? 0) > 0) {
      lines.push("##### 输出要素", "", renderFeatureTable(block.output_table ?? []), "");
    }
  }

  return trimTrailingBlankLines(lines).join("\n");
}

function renderFeatureTable(records: FeatureFieldRecord[]) {
  return renderMarkdownTable(
    ["字段", "类型", "必填", "枚举值", "说明"],
    records.map((record) => [
      record.field,
      record.type,
      record.required,
      record.enum_values,
      record.note,
    ]),
  );
}

function renderMarkdownList(items: string[], ordered: boolean) {
  if (items.length === 0) return "";

  return items
    .map((item, index) => (ordered ? `${index + 1}. ${item}` : `- ${item}`))
    .join("\n");
}

function renderMarkdownTable(headers: string[], rows: string[][]) {
  const headerLine = `| ${headers.join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map((row) => `| ${row.map(escapeMarkdownTableCell).join(" | ")} |`);
  return [headerLine, dividerLine, ...rowLines].join("\n");
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, "<br />");
}

function toChineseFeatureLabel(index: number) {
  const labels = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  return labels[index - 1] ?? String(index);
}

function trimTrailingBlankLines(lines: string[]) {
  const clonedLines = [...lines];
  while (clonedLines.at(-1) === "") {
    clonedLines.pop();
  }

  return clonedLines;
}

function nowIsoString() {
  return new Date().toISOString();
}
