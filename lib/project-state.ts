import path from "node:path";
import { promises as fs } from "node:fs";
import {
  PROJECT_REFERENCES_DERIVED_ROOT,
  PROJECT_REFERENCES_RAW_ROOT,
  PROJECT_SKILLS_ROOT,
  PROJECT_TEMPLATES_ROOT,
  PROJECT_TEMPLATE_PROFILES_ROOT,
  REQAGENT_LEGACY_ROOT,
  REQAGENT_RUNTIME_ROOT,
} from "@/lib/project-paths";

let ensureProjectStatePromise: Promise<void> | null = null;

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath: string) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function moveToLegacy(sourcePath: string, destinationPath: string) {
  if (!(await pathExists(sourcePath))) return;

  await ensureDir(path.dirname(destinationPath));

  try {
    await fs.rename(sourcePath, destinationPath);
  } catch {
    await fs.cp(sourcePath, destinationPath, { recursive: true, force: true });
    await fs.rm(sourcePath, { recursive: true, force: true });
  }
}

async function promoteLegacySkills(legacyRunRoot: string) {
  const sourceRoot = path.join(REQAGENT_RUNTIME_ROOT, "skills");
  if (!(await pathExists(sourceRoot))) return;

  await ensureDir(PROJECT_SKILLS_ROOT);
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(PROJECT_SKILLS_ROOT, entry.name);
    if (await pathExists(targetPath)) continue;

    try {
      await fs.rename(sourcePath, targetPath);
    } catch {
      await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
      await fs.rm(sourcePath, { recursive: true, force: true });
    }
  }

  await moveToLegacy(sourceRoot, path.join(legacyRunRoot, "skills"));
}

async function migrateLegacyThreadWorkspaces(legacyRunRoot: string) {
  const threadsRoot = path.join(REQAGENT_RUNTIME_ROOT, "threads");
  if (!(await pathExists(threadsRoot))) return;

  const threadDirs = await fs.readdir(threadsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of threadDirs) {
    if (!entry.isDirectory()) continue;
    const workspacePath = path.join(threadsRoot, entry.name, "workspace");
    if (!(await pathExists(workspacePath))) continue;
    await moveToLegacy(
      workspacePath,
      path.join(legacyRunRoot, "thread-workspaces", entry.name),
    );
  }
}

async function migrateLegacyRuntimeDirs(legacyRunRoot: string) {
  const legacyEntries = [
    {
      source: path.join(REQAGENT_RUNTIME_ROOT, "workspace"),
      destination: path.join(legacyRunRoot, "workspace"),
    },
    {
      source: path.join(REQAGENT_RUNTIME_ROOT, "vendor"),
      destination: path.join(legacyRunRoot, "vendor"),
    },
    {
      source: path.join(REQAGENT_RUNTIME_ROOT, "mcp.json"),
      destination: path.join(legacyRunRoot, "mcp.json"),
    },
  ];

  for (const entry of legacyEntries) {
    await moveToLegacy(entry.source, entry.destination);
  }
}

async function ensureProjectStructure() {
  await Promise.all([
    ensureDir(PROJECT_SKILLS_ROOT),
    ensureDir(PROJECT_TEMPLATES_ROOT),
    ensureDir(PROJECT_TEMPLATE_PROFILES_ROOT),
    ensureDir(PROJECT_REFERENCES_RAW_ROOT),
    ensureDir(PROJECT_REFERENCES_DERIVED_ROOT),
    ensureDir(REQAGENT_LEGACY_ROOT),
  ]);

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const legacyRunRoot = path.join(REQAGENT_LEGACY_ROOT, stamp);

  await promoteLegacySkills(legacyRunRoot);
  await migrateLegacyThreadWorkspaces(legacyRunRoot);
  await migrateLegacyRuntimeDirs(legacyRunRoot);
}

export async function ensureProjectState() {
  ensureProjectStatePromise ??= ensureProjectStructure().catch((error) => {
    ensureProjectStatePromise = null;
    throw error;
  });

  return ensureProjectStatePromise;
}
