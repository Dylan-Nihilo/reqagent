# Plan: Workspace Tool Optimization

> Status: Ready for execution
> Target file: `app/api/chat/route.ts`
> Context: bash tool already replaced (just-bash → execa). Remaining tools need quality improvements based on user ratings.

## Background

User ratings for current tools (post-bash replacement):

| Tool | Rating | Key Issues |
|------|--------|------------|
| bash | 9/10 | Done — execa with graceful timeout, real /bin/bash |
| readFile | 8.5/10 | Done — line-based pagination added |
| writeFile | 8/10 | Done — overwrite/append/patch modes |
| list_files | 7/10 | Needs: sorting, hidden file toggle, summary stats |
| search_workspace | 6/10 | Needs: regex support, relevance ranking, performance |
| list_available_tools | 7/10 | Needs: richer descriptions, categorization |
| fetch_url | N/A | Basic Jina reader, works fine |

## Tasks

### Task 1: Enhance `search_workspace` (priority: highest, rating 6/10 → 8+)

Current issues:
- No regex support — only literal case-insensitive string match
- No relevance ranking — results returned in filesystem walk order
- Performance: reads entire file into memory, splits all lines, scans linearly
- No file count summary (how many files were searched)

Changes in `app/api/chat/route.ts`, inside the `search_workspace` tool:

1. **Add `regex` boolean param** to inputSchema:
   ```ts
   regex: { type: "boolean", description: "Treat query as regex pattern (default: false)" }
   ```

2. **Implement regex matching**:
   ```ts
   const pattern = regex
     ? new RegExp(query, "i")
     : null;
   // In the match loop:
   const isMatch = pattern
     ? pattern.test(lines[i])
     : lines[i].toLowerCase().includes(lowerQuery);
   ```

3. **Add `filesSearched` counter** — increment for each file examined, return in result:
   ```ts
   return { query, found: matches.length, totalMatches, filesSearched, matches, truncated: ... };
   ```

4. **Sort matches by relevance** — exact match > starts-with > contains. After collecting all matches:
   ```ts
   matches.sort((a, b) => {
     const scoreA = a.match.toLowerCase() === lowerQuery ? 0 : a.match.toLowerCase().startsWith(lowerQuery) ? 1 : 2;
     const scoreB = b.match.toLowerCase() === lowerQuery ? 0 : b.match.toLowerCase().startsWith(lowerQuery) ? 1 : 2;
     return scoreA - scoreB;
   });
   ```

5. **Add `maxFileSize` param** (optional, default 512KB) so user can search larger files if needed:
   ```ts
   maxFileSize: { type: "number", description: "Max file size in bytes to search (default: 524288)" }
   ```

### Task 2: Enhance `list_files` (priority: medium, rating 7/10 → 8.5+)

Current issues:
- No sorting option — always filesystem order
- No summary stats (total size, file count vs dir count)
- No hidden file toggle
- IGNORED set is hardcoded with no override

Changes:

1. **Add `sort` param**: `"name"` (default) | `"size"` | `"mtime"`:
   ```ts
   sort: { type: "string", enum: ["name", "size", "mtime"], description: "Sort order (default: name)" }
   ```

2. **Add `showHidden` boolean param** (default: false):
   ```ts
   showHidden: { type: "boolean", description: "Include dotfiles (default: false)" }
   ```
   In the walk function, skip entries starting with `.` unless `showHidden` is true.

3. **Add summary stats** to the return value:
   ```ts
   const fileCount = entries.filter(e => e.type === "file").length;
   const dirCount = entries.filter(e => e.type === "dir").length;
   const totalSize = entries.reduce((sum, e) => sum + (e.size ?? 0), 0);
   return { root, entries, count, truncated, fileCount, dirCount, totalSize };
   ```

4. **Sort entries** before returning:
   ```ts
   if (sort === "size") entries.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
   else if (sort === "mtime") entries.sort((a, b) => (b.mtime ?? "").localeCompare(a.mtime ?? ""));
   // default: name — already in walk order (alphabetical per dir)
   ```

### Task 3: Enhance `list_available_tools` (priority: low, rating 7/10 → 8+)

Current issues:
- Returns only tool names, no descriptions
- No categorization (workspace / shell / mcp / meta)

Changes:

1. **Return structured tool info** instead of just names:
   ```ts
   const toolEntries = mountedNames.map(name => ({
     name,
     category: categorize(name),
     description: getToolDescription(name, allTools),
   }));
   ```

2. **Add `categorize` helper**:
   ```ts
   function categorize(name: string) {
     if (["list_files", "search_workspace", "readFile", "writeFile", "fetch_url"].includes(name)) return "workspace";
     if (name === "bash") return "shell";
     if (name === "list_available_tools") return "meta";
     return "mcp";
   }
   ```

3. **Extract description from tool objects**:
   ```ts
   function getToolDescription(name: string, tools: Record<string, any>) {
     const t = tools[name];
     return t?.description ?? t?.tool?.description ?? "External tool";
   }
   ```

### Task 4: Minor readFile/writeFile polish (priority: low)

These are already 8-8.5/10. Small improvements:

1. **readFile**: Add `encoding` param (default: `"utf8"`, support `"base64"` for binary files):
   ```ts
   encoding: { type: "string", enum: ["utf8", "base64"], description: "File encoding (default: utf8)" }
   ```
   When `base64`, return `{ content: buffer.toString("base64"), encoding: "base64", sizeBytes }` without line splitting.

2. **writeFile patch mode**: Support `replaceAll` flag for global replacement:
   ```ts
   replaceAll: { type: "boolean", description: "Replace all occurrences in patch mode (default: false, replaces first only)" }
   ```
   Use `existing.replaceAll(match, content)` when true.

## Verification

After all changes:
1. `pnpm typecheck` must pass
2. Start dev server, send these test messages:
   - "查看工作区文件" → verify list_files returns stats
   - "搜索 TODO" → verify search_workspace with context
   - "你有什么工具" → verify list_available_tools with categories
3. Test regex search: "用正则搜索所有 import 语句"

## Files Modified

- `app/api/chat/route.ts` — all tool definitions live here

## Do NOT Change

- `executeInWorkspace()` function — already finalized with execa
- bash tool — already 9/10, no changes needed
- SYSTEM_PROMPT — update only if tool descriptions change significantly
- Any frontend files — this plan is backend-only
