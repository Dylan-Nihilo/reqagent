# Section Accumulator — Implementation Spec

## Problem

The current DOCX generation pipeline requires the LLM to output an entire requirements document (~20,000 chars) in a single `writeFile` call. This exceeds practical per-turn output limits (~4,000-8,000 tokens), causing truncation or quality degradation in later sections.

## Solution: Section-level Accumulator

Replace the monolithic `writeFile` → `export_docx` flow with an incremental section-by-section approach. A server-side document builder accumulates sections across multiple tool calls, then assembles the final DOCX.

## Architecture

```
DocumentBuilder (in-memory per workspace, persisted to disk)
├── outline: SectionSlot[]        ← derived from template profile
├── sections: Map<id, content>    ← filled incrementally
├── metadata: { title, author, version, ... }
└── status: "drafting" | "complete"
```

### New Tools (replace nothing — additive, coexist with existing tools)

#### 1. `init_document`

Create a new document builder session. Returns the outline with all section slots.

```typescript
inputSchema: {
  title: string;              // document title
  templateProfileId?: string; // default: "user-requirements-base-v1"
  author?: string;
  version?: string;
  organization?: string;
}

returns: {
  documentId: string;         // UUID
  outline: Array<{
    sectionId: string;        // e.g. "1.1", "3.2.1"
    title: string;
    required: boolean;
    targetChars: number;
    status: "pending";
    contentTypes: string[];   // ["paragraph", "table", etc.]
  }>;
  featureBlockSlots: number;  // how many capability slots available
  totalTargetChars: number;
}
```

#### 2. `fill_section`

Fill one section of the document. Can be called repeatedly. Idempotent — calling again overwrites.

```typescript
inputSchema: {
  documentId: string;
  sectionId: string;          // must match outline
  content: string;            // markdown content for this section
  // For feature blocks specifically:
  featureBlock?: {
    name: string;
    processItems: string[];   // business flow steps
    detailItems: string[];    // function descriptions
    ruleItems: string[];      // business rules
    inputTable?: Array<{ field: string; type: string; required: string; enumValues: string; note: string }>;
    outputTable?: Array<{ field: string; type: string; required: string; enumValues: string; note: string }>;
  };
  // For department table:
  departmentRecords?: Array<{ department: string; duty: string }>;
  // For terms table:
  termRecords?: Array<{ term: string; definition: string }>;
}

returns: {
  sectionId: string;
  status: "filled";
  actualChars: number;
  targetChars: number;
  ratio: number;
  withinRange: boolean;
}
```

#### 3. `get_document_status`

Check progress. The LLM calls this to decide what to fill next.

```typescript
inputSchema: {
  documentId: string;
}

returns: {
  documentId: string;
  title: string;
  status: "drafting" | "complete";
  filled: Array<{ sectionId: string; title: string; chars: number; ratio: number }>;
  pending: Array<{ sectionId: string; title: string; targetChars: number; required: boolean }>;
  featureBlocks: { filled: number; total: number };
  totalChars: number;
  totalTargetChars: number;
  completionRatio: number;
}
```

#### 4. `finalize_document`

Assemble all sections and export DOCX. Fails if required sections are missing.

```typescript
inputSchema: {
  documentId: string;
  filename?: string;
}

returns: {
  outputPath: string;
  downloadName: string;
  qualityReport: DocxQualityReport;
  relationIntegrity: DocxRelationIntegrity;
  sizeBytes: number;
}
```

## Implementation Details

### DocumentBuilder class

Location: `lib/workspace/document-builder.ts`

```typescript
class DocumentBuilder {
  readonly id: string;
  readonly workspaceDir: string;
  private profile: DocxTemplateProfile;
  private metadata: DocumentMetadata;
  private sections: Map<string, SectionContent>;
  private featureBlocks: Map<number, FeatureBlockContent>;
  private departmentRecords: Array<{ department: string; duty: string }>;
  private termRecords: Array<{ term: string; definition: string }>;

  constructor(workspaceDir: string, opts: InitDocumentOpts);

  fillSection(sectionId: string, content: SectionContent): SectionFillResult;
  addFeatureBlock(block: FeatureBlockContent): void;
  getStatus(): DocumentStatus;
  isComplete(): boolean;

  // Assembles markdown from all sections
  toMarkdown(): string;

  // Persists state to workspace for crash recovery
  async save(): Promise<void>;
  static async load(workspaceDir: string, id: string): Promise<DocumentBuilder>;
}
```

### State persistence

Save builder state as JSON to `{workspaceDir}/.docbuilder/{documentId}.json` after each `fill_section` call. This enables:
- Crash recovery (resume after server restart)
- Multi-turn continuity (user says "继续" in new conversation turn)
- Inspection (user can see partial state)

### Tool registration

Add to `buildDocxTools()` in `lib/workspace/docx-tools.ts`. Keep existing `parse_docx` and `export_docx` tools — they still work for simple cases. The new tools are for the incremental workflow.

### System prompt update

Add to `route.ts` system prompt:
```
生成长文档时（预计超过 3000 字），使用增量模式：
1. init_document → 创建文档并查看章节大纲
2. fill_section → 逐章节填充（每次 1-2 个章节）
3. get_document_status → 检查进度，决定下一步
4. finalize_document → 全部填完后导出 DOCX

短文档可继续使用 writeFile + export_docx 的直接模式。
```

## File Changes

| File | Change |
|------|--------|
| `lib/workspace/document-builder.ts` | **NEW** — DocumentBuilder class + persistence |
| `lib/workspace/docx-tools.ts` | ADD 4 new tools in `buildDocxTools()` |
| `lib/workspace/docx-support.ts` | EXTRACT section-matching logic into reusable functions (currently private) |
| `lib/tool-registry.ts` | ADD registry entries for 4 new tools |
| `app/api/chat/route.ts` | UPDATE system prompt with incremental workflow guidance |
| `lib/workspace/__tests__/document-builder.test.ts` | **NEW** — unit tests |
| `lib/workspace/__tests__/section-accumulator-e2e.test.ts` | **NEW** — integration test |

## Constraints

- All tool names use snake_case: `init_document`, `fill_section`, `get_document_status`, `finalize_document`
- Keep existing `parse_docx` and `export_docx` tools unchanged — backward compatible
- `finalize_document` internally calls the existing `buildDocxTemplatePayload` + `fillDocxTemplate` pipeline
- DocumentBuilder state files are gitignored (ephemeral workspace data)
- Feature blocks are filled via `fill_section` with the `featureBlock` parameter, one at a time
- Section IDs match the existing `DocxTemplateProfile.sectionContracts[].id` values

## Testing Strategy

1. Unit: DocumentBuilder state management (fill, overwrite, status, persistence, load)
2. Unit: Section validation (required check, char ratio)
3. Integration: init → fill 3 sections → status → fill remaining → finalize → verify DOCX
4. Integration: Crash recovery (save → load → continue → finalize)

## Out of Scope

- Template profile auto-detection from `parse_docx` (future enhancement)
- Real-time progress streaming to frontend (can use existing metadata handler)
- Concurrent document builders per workspace (single active document for now)
