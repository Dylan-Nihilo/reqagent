# Plan: Skill System Design & Implementation

> Status: Ready for execution
> Phase: 4 (per project roadmap)
> Prerequisites: Phase 2 (workspace) mostly done, Phase 3 (MCP) infrastructure exists in `lib/mcp.ts`
> Reference: `docs/ReqAgent-Skill目录规划.md` (concept doc, written 2026-03-19)

## Goal

Build a Skill system that lets users hot-plug domain knowledge and capability modules into the Agent at runtime. Skills inject system prompt segments, knowledge documents, and optionally custom tools.

Two skill types:
- **Capability Skills**: Add tools/abilities (document parsing, web scraping, chart generation)
- **Knowledge Skills**: Inject domain knowledge into system prompt (PRD templates, compliance rules, glossary)

## Architecture Overview

```
.reqagent/
├── skills/                          # Skill registry (git-tracked or managed)
│   ├── req-prd-template/           # Knowledge skill example
│   │   ├── skill.json
│   │   ├── prompt.md
│   │   ├── knowledge/
│   │   │   ├── template.md
│   │   │   └── checklist.md
│   │   └── output-template.md
│   └── web-scraper/                # Capability skill example
│       ├── skill.json
│       ├── prompt.md
│       └── tools.ts                # Optional: custom tool definitions
├── workspaces/
└── reqagent.db
```

```
Request flow:

Browser                          Server
  │                                │
  │  POST /api/chat                │
  │  { messages, skills: [...] }   │
  │ ─────────────────────────────> │
  │                                │  1. Load skill manifests
  │                                │  2. Merge skill prompts into system prompt
  │                                │  3. Load skill knowledge into context
  │                                │  4. Register skill tools (if any)
  │                                │  5. streamText({ system, tools, ... })
  │ <───────────────────────────── │
  │  UI Message Stream             │
```

## Tasks

### Phase 4a: Core Skill Loader (backend)

#### Task 1: Define skill manifest schema

Create `lib/skills/types.ts`:

```ts
export interface SkillManifest {
  id: string;                    // Directory name, e.g. "req-prd-template"
  name: string;                  // Display name: "银行 PRD 模板"
  version: string;               // Semver: "1.0.0"
  type: "knowledge" | "capability" | "hybrid";
  domain?: string;               // Optional domain tag: "banking", "finance"
  description: string;           // One-line description for UI
  author?: string;
  tags?: string[];               // For filtering: ["prd", "banking", "compliance"]

  // What this skill provides
  provides: {
    prompt?: boolean;            // Has prompt.md
    knowledge?: boolean;         // Has knowledge/ directory
    outputTemplate?: boolean;    // Has output-template.md
    tools?: boolean;             // Has tools.ts (capability skills)
  };
}

export interface LoadedSkill {
  manifest: SkillManifest;
  prompt: string;                // Content of prompt.md
  knowledge: string;             // Merged content of knowledge/*.md
  outputTemplate: string;        // Content of output-template.md (or "")
  // tools are loaded separately via dynamic import
}
```

#### Task 2: Implement skill loader

Create `lib/skills/loader.ts`:

```ts
import path from "node:path";
import { promises as fs } from "node:fs";
import type { SkillManifest, LoadedSkill } from "./types";

const SKILLS_DIR = path.join(process.cwd(), ".reqagent", "skills");

export async function listSkills(): Promise<SkillManifest[]> {
  // Read all subdirectories in SKILLS_DIR
  // Parse skill.json from each
  // Return array of manifests
}

export async function loadSkill(skillId: string): Promise<LoadedSkill> {
  // 1. Read and parse skill.json
  // 2. Read prompt.md (required)
  // 3. Read and merge all knowledge/*.md files
  // 4. Read output-template.md (optional)
  // Return LoadedSkill
}

export async function loadKnowledgeDir(dir: string): Promise<string> {
  // Read all .md files in dir
  // Concatenate with section headers (filename as header)
  // Return merged string
}
```

Key decisions for the implementer:
- Knowledge files are concatenated with `---` separators and `### filename` headers
- Total knowledge size should be capped (suggest 32K chars) to avoid flooding context
- If knowledge exceeds cap, truncate with `[...truncated, N more files]`

#### Task 3: Integrate into chat route

Modify `app/api/chat/route.ts`:

1. **Accept `skills` param** from request body:
   ```ts
   const skillIds = Array.isArray((body as { skills?: unknown }).skills)
     ? (body as { skills?: string[] }).skills ?? []
     : [];
   ```

2. **Load skills and build extended system prompt**:
   ```ts
   import { loadSkill } from "@/lib/skills/loader";

   const loadedSkills = await Promise.all(
     skillIds.map(id => loadSkill(id).catch(() => null))
   ).then(results => results.filter(Boolean) as LoadedSkill[]);

   const skillPromptSection = buildSkillPromptSection(loadedSkills);
   ```

3. **Create `buildSkillPromptSection` function**:
   ```ts
   function buildSkillPromptSection(skills: LoadedSkill[]): string {
     if (skills.length === 0) return "";
     return [
       "\n# 已加载的 Skill\n",
       ...skills.map(s => [
         `## ${s.manifest.name}`,
         "",
         s.prompt,
         s.knowledge ? `\n### 领域知识\n\n${s.knowledge}` : "",
         s.outputTemplate ? `\n### 输出格式\n\n${s.outputTemplate}` : "",
       ].join("\n")),
     ].join("\n\n");
   }
   ```

4. **Append to system prompt** in the streamText call:
   ```ts
   system: `${SYSTEM_PROMPT}\n${skillPromptSection}\n\n当前会话 thread_id: ...`
   ```

#### Task 4: Skill list API endpoint

Create `app/api/skills/route.ts`:

```ts
// GET /api/skills — list all available skills
// Response: { skills: SkillManifest[] }

// GET /api/skills/[id] — get skill detail
// Response: LoadedSkill (without full knowledge, just metadata + preview)
```

This endpoint is consumed by the frontend skill selector.

### Phase 4b: Seed Skills (content)

#### Task 5: Create first knowledge skill — generic PRD template

Create `.reqagent/skills/req-prd-generic/`:

```
skill.json:
{
  "id": "req-prd-generic",
  "name": "通用 PRD 模板",
  "version": "1.0.0",
  "type": "knowledge",
  "description": "标准产品需求文档模板，含需求分析、用户故事、验收标准",
  "tags": ["prd", "generic"],
  "provides": { "prompt": true, "knowledge": true, "outputTemplate": true }
}

prompt.md:
- Instructions telling the Agent HOW to write a PRD
- Section structure requirements
- Quality checklist

knowledge/template.md:
- Standard PRD sections (background, goals, user stories, non-functional, glossary)

knowledge/checklist.md:
- Review checklist items

output-template.md:
- Markdown template with section placeholders
```

#### Task 6: Create first capability skill — Mermaid diagram

Create `.reqagent/skills/cap-mermaid/`:

```
skill.json:
{
  "id": "cap-mermaid",
  "name": "Mermaid 图表",
  "version": "1.0.0",
  "type": "capability",
  "description": "生成流程图、时序图、ER图等 Mermaid 图表",
  "tags": ["diagram", "mermaid", "visualization"],
  "provides": { "prompt": true, "knowledge": true }
}

prompt.md:
- Instructions for when and how to generate Mermaid diagrams
- Prefer flowchart for process flows, sequenceDiagram for APIs, erDiagram for data models

knowledge/syntax-reference.md:
- Mermaid syntax quick reference (flowchart, sequence, ER, gantt)
- Common patterns and examples
```

No custom tools needed — Agent outputs Mermaid code blocks, frontend renders them.

### Phase 4c: Frontend Skill Selector

#### Task 7: Workspace skill configuration

Create a way for users to select which skills are active for their workspace.

**Option A (simpler)**: Store active skill IDs in localStorage per workspace:
```ts
// lib/workspace-client.ts
export function getWorkspaceSkills(workspaceId: string): string[] { ... }
export function setWorkspaceSkills(workspaceId: string, skillIds: string[]): void { ... }
```

**Option B (persistent)**: Add `workspace_skills` table to SQLite:
```sql
CREATE TABLE workspace_skills (
  workspace_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, skill_id)
);
```

Recommendation: Start with Option A for speed, migrate to B when needed.

#### Task 8: Skill selector UI component

Create `components/ReqSkillSelector.tsx`:

- Renders in the landing page or settings panel
- Shows available skills as toggle chips/cards
- Each skill shows: name, description, type badge (knowledge/capability), tags
- Active skills are highlighted
- Selection is sent with each `/api/chat` request

Design reference — follow the existing monochrome design system:
- Use `--ra-*` CSS variables
- Chip-style toggles similar to suggestion chips in ReqAgentUI
- CSS Module: `ReqSkillSelector.module.css`

#### Task 9: Wire skill selection into chat transport

Modify `app/page.tsx`:

1. Read active skill IDs from workspace config
2. Pass them in the chat transport body:
   ```ts
   const transport = new AssistantChatTransport({
     api: "/api/chat",
     body: {
       workspaceId,
       skills: activeSkillIds,  // <-- new
     },
   });
   ```

### Phase 4d: Advanced (defer unless needed)

These are NOT in scope for initial implementation. Listed for future reference:

- **Skill marketplace/upload UI** — manage skills from the browser
- **Capability skill tools** — dynamic tool registration from `tools.ts` in skill dir
- **Skill versioning** — track which version was used per thread
- **Skill effect measurement** — A/B test skill quality impact
- **MCP-backed skills** — a skill that spins up an MCP server (e.g. document parser)

## Files to Create

| File | Purpose |
|------|---------|
| `lib/skills/types.ts` | SkillManifest, LoadedSkill types |
| `lib/skills/loader.ts` | listSkills(), loadSkill(), loadKnowledgeDir() |
| `app/api/skills/route.ts` | GET endpoint for skill list |
| `components/ReqSkillSelector.tsx` | Skill toggle UI |
| `components/ReqSkillSelector.module.css` | Styles |
| `.reqagent/skills/req-prd-generic/` | Seed knowledge skill |
| `.reqagent/skills/cap-mermaid/` | Seed capability skill |

## Files to Modify

| File | Change |
|------|--------|
| `app/api/chat/route.ts` | Accept `skills` param, load skills, merge into system prompt |
| `app/page.tsx` | Pass active skill IDs in transport body |
| `lib/workspace-client.ts` | Add skill selection storage helpers |

## Do NOT Change

- `lib/mcp.ts` — MCP is a separate system, skills don't use MCP protocol
- Tool definitions in `route.ts` — skills add prompt context, not workspace tools (Phase 4d exception)
- `lib/db/schema.ts` — no DB changes in initial version (use localStorage)
- Thread persistence logic — skills are workspace-level, not thread-level

## Execution Order

```
Task 1 (types) → Task 2 (loader) → Task 3 (route integration) → Task 4 (API)
    ↓                                                                ↓
Task 5 (seed PRD skill) + Task 6 (seed Mermaid skill)         Task 7 (storage)
                                                                     ↓
                                                              Task 8 (UI) → Task 9 (wire)
```

Tasks 1-4 are backend, can be done in one session.
Tasks 5-6 are content, can be done in parallel.
Tasks 7-9 are frontend, depend on Tasks 1-4.

## Verification

1. `pnpm typecheck` passes after each task
2. Create seed skills manually, verify `GET /api/skills` returns them
3. Send chat with `skills: ["req-prd-generic"]`, verify system prompt includes skill content
4. Check server logs for skill loading output
5. Visual: skill selector renders in landing page, toggles work
