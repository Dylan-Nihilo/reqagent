import { promises as fs } from "node:fs";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const CATALOG_PATH = path.join(PROJECT_ROOT, "references", "catalog.json");
const DERIVED_ROOT = path.join(PROJECT_ROOT, "references", "derived");

async function loadCatalog() {
  const raw = await fs.readFile(CATALOG_PATH, "utf8");
  return JSON.parse(raw);
}

async function ensureDerivedRoot() {
  await fs.mkdir(DERIVED_ROOT, { recursive: true });
}

async function summarizeReference(entry) {
  const entryPath = path.join(PROJECT_ROOT, entry.path);
  const stat = await fs.stat(entryPath);
  return {
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    path: entry.path,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    size: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function formatSummary(summary) {
  return "# " + summary.label + "\n\n" +
    `- 模板 ID: ${summary.id}\n` +
    `- 类型: ${summary.kind}\n` +
    `- 路径: ${summary.path}\n` +
    `- 标签: ${summary.tags.length > 0 ? summary.tags.join(", ") : "-"}\n` +
    `- 文件大小: ${summary.size} 字节\n` +
    `- 最近修改: ${summary.mtime}\n`;
}

async function main() {
  await ensureDerivedRoot();
  const catalog = await loadCatalog();
  for (const entry of catalog) {
    try {
      const summary = await summarizeReference(entry);
      const fileName = `${entry.id}.md`;
      const targetPath = path.join(DERIVED_ROOT, fileName);
      await fs.writeFile(targetPath, formatSummary(summary), "utf8");
      console.log(`wrote derived summary: ${targetPath}`);
    } catch (error) {
      console.error(`failed to summarize ${entry.id}:`, error);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
