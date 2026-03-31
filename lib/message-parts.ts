import { normalizeToolStatus, type AgentActivity, type ReqAgentToolStatus } from "@/lib/types";
import { readMessageParts } from "@/lib/ui-message-utils";

export type ReqMessagePartKind = "text" | "reasoning" | "tool" | "source" | "file" | "image" | "unknown";
export type ReqMessagePartSurface = "primary" | "process" | "execution" | "reference" | "attachment" | "unknown";
export type ReqMessagePartRenderMode = "flow" | "collapsible" | "delegated" | "linked" | "tile" | "unknown";

export type ReqMessagePartSpec = {
  kind: ReqMessagePartKind;
  label: string;
  surface: ReqMessagePartSurface;
  renderMode: ReqMessagePartRenderMode;
  rawTypes: string[];
  note: string;
};

export type ReqMessagePartSummary = {
  index: number;
  rawType: string;
  kind: ReqMessagePartKind;
  label: string;
  surface: ReqMessagePartSurface;
  renderMode: ReqMessagePartRenderMode;
  toolCallId?: string;
  toolName?: string;
  statusType?: string;
  toolState?: ReqAgentToolStatus;
  hasResult: boolean;
  countsAsOutput: boolean;
  textLength?: number;
  textPreview?: string;
};

const partSpecs = {
  text: {
    kind: "text",
    label: "正文",
    surface: "primary",
    renderMode: "flow",
    rawTypes: ["text"],
    note: "主阅读层。Markdown、代码块、列表都属于这里。",
  },
  reasoning: {
    kind: "reasoning",
    label: "推理",
    surface: "process",
    renderMode: "collapsible",
    rawTypes: ["reasoning"],
    note: "过程层。运行时可展开，完成后应压缩，不替代正文。",
  },
  tool: {
    kind: "tool",
    label: "工具",
    surface: "execution",
    renderMode: "delegated",
    rawTypes: ["tool-call"],
    note: "执行层。结果挂在同一个 tool-call part 上，由 Tool UI 展开细节。",
  },
  source: {
    kind: "source",
    label: "引用",
    surface: "reference",
    renderMode: "linked",
    rawTypes: ["source", "source-url", "source-document"],
    note: "引用层。保留来源语义，不退化成裸链接。",
  },
  image: {
    kind: "image",
    label: "图像",
    surface: "attachment",
    renderMode: "tile",
    rawTypes: ["image"],
    note: "附件层。用预览块承载，不塞回正文段落。",
  },
  file: {
    kind: "file",
    label: "文件",
    surface: "attachment",
    renderMode: "tile",
    rawTypes: ["file"],
    note: "附件层。作为独立文件块出现，给后续流程消费。",
  },
  unknown: {
    kind: "unknown",
    label: "未知",
    surface: "unknown",
    renderMode: "unknown",
    rawTypes: [],
    note: "保底分支。说明协议里出现了尚未定义的 part。",
  },
} as const satisfies Record<ReqMessagePartKind, ReqMessagePartSpec>;

const rawTypeToKind = new Map<string, ReqMessagePartKind>(
  Object.values(partSpecs).flatMap((spec) => spec.rawTypes.map((rawType) => [rawType, spec.kind] as const)),
);

export const reqMessagePartCatalog = [
  partSpecs.text,
  partSpecs.reasoning,
  partSpecs.tool,
  partSpecs.source,
  partSpecs.image,
  partSpecs.file,
] as const satisfies readonly ReqMessagePartSpec[];

export const reqMessagePartSurfaceLabels: Record<ReqMessagePartSurface, string> = {
  primary: "主阅读层",
  process: "过程层",
  execution: "执行层",
  reference: "引用层",
  attachment: "附件层",
  unknown: "未知层",
};

export function getReqMessagePartKind(rawType: string | null | undefined): ReqMessagePartKind {
  if (!rawType) {
    return "unknown";
  }

  return rawTypeToKind.get(rawType) ?? "unknown";
}

export function getReqMessagePartSpec(kind: ReqMessagePartKind): ReqMessagePartSpec {
  return partSpecs[kind];
}

export function summarizeMessageParts(content: unknown): ReqMessagePartSummary[] {
  const parts = readMessageParts(content);
  if (parts.length === 0) {
    return [];
  }

  return parts.map((part, index) => summarizeMessagePart(part, index));
}

export function hasRenderableMessageOutput(content: unknown) {
  return summarizeMessageParts(content).some((part) => part.countsAsOutput);
}

export function inferAgentActivityFromMessageParts(content: unknown): AgentActivity | undefined {
  const parts = summarizeMessageParts(content);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];

    if (part.kind === "reasoning") return "thinking";
    if (part.kind === "tool") return part.toolState === "running" ? "tool_calling" : "responding";
    if (part.kind === "text" || part.kind === "source" || part.kind === "file" || part.kind === "image") {
      return "responding";
    }
  }

  return undefined;
}

function summarizeMessagePart(part: unknown, index: number): ReqMessagePartSummary {
  if (!isRecord(part)) {
    return {
      index,
      rawType: "unknown",
      kind: "unknown",
      label: partSpecs.unknown.label,
      surface: partSpecs.unknown.surface,
      renderMode: partSpecs.unknown.renderMode,
      hasResult: false,
      countsAsOutput: false,
    };
  }

  const rawType = typeof part.type === "string" ? part.type : "unknown";
  const kind = getReqMessagePartKind(rawType);
  const spec = getReqMessagePartSpec(kind);
  const text = typeof part.text === "string" ? part.text : null;
  const hasResult = Object.prototype.hasOwnProperty.call(part, "result") && part.result !== undefined;
  const status = asStatus(part.status);
  const toolState =
    kind === "tool"
      ? normalizeToolStatus(status ?? { type: hasResult ? "output-available" : "running" })
      : undefined;

  return {
    index,
    rawType,
    kind,
    label: spec.label,
    surface: spec.surface,
    renderMode: spec.renderMode,
    toolCallId: typeof part.toolCallId === "string" ? part.toolCallId : undefined,
    toolName: typeof part.toolName === "string" ? part.toolName : undefined,
    statusType: status?.type,
    toolState,
    hasResult,
    countsAsOutput: resolvesAsRenderableOutput(kind, text, hasResult),
    textLength: text?.length,
    textPreview: text ? truncatePreview(text, 160) : undefined,
  };
}

function resolvesAsRenderableOutput(kind: ReqMessagePartKind, text: string | null, hasResult: boolean) {
  switch (kind) {
    case "text":
      return Boolean(text?.trim());
    case "tool":
      return hasResult;
    case "source":
    case "file":
    case "image":
      return true;
    default:
      return false;
  }
}

function truncatePreview(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function asStatus(value: unknown): { type: string } | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  return { type: value.type };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
