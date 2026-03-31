import path from "node:path";
import { promises as fs } from "node:fs";
import {
  PROJECT_DEFAULT_TEMPLATE_ID,
  PROJECT_DEFAULT_TEMPLATE_PATH,
  PROJECT_DEFAULT_TEMPLATE_SUMMARY_PATH,
  PROJECT_REFERENCE_CATALOG_PATH,
  PROJECT_ROOT_DIR,
  PROJECT_TEMPLATE_REGISTRY_PATH,
} from "@/lib/project-paths";
import { ensureProjectState } from "@/lib/project-state";

export type ProjectTemplateRegistryItem = {
  id: string;
  label: string;
  templatePath: string;
  summaryPath: string;
  sourceReferenceIds: string[];
  isDefault?: boolean;
};

export type ProjectReferenceCatalogItem = {
  id: string;
  label: string;
  kind: "template" | "sample" | "guide";
  path: string;
  tags?: string[];
};

export type ProjectTemplateResolution = {
  item: ProjectTemplateRegistryItem;
  absoluteTemplatePath: string;
  absoluteSummaryPath: string;
};

const DEFAULT_TEMPLATE_REGISTRY: ProjectTemplateRegistryItem[] = [
  {
    id: PROJECT_DEFAULT_TEMPLATE_ID,
    label: "默认需求说明书模板",
    templatePath: "templates/profiles/default/template.docx",
    summaryPath: "templates/profiles/default/summary.md",
    sourceReferenceIds: [],
    isDefault: true,
  },
];

async function readJsonFile<T>(targetPath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function readTemplateRegistry(): Promise<ProjectTemplateRegistryItem[]> {
  await ensureProjectState();
  const registry = await readJsonFile<ProjectTemplateRegistryItem[]>(
    PROJECT_TEMPLATE_REGISTRY_PATH,
    DEFAULT_TEMPLATE_REGISTRY,
  );
  return registry.length > 0 ? registry : DEFAULT_TEMPLATE_REGISTRY;
}

export async function readReferenceCatalog(): Promise<ProjectReferenceCatalogItem[]> {
  await ensureProjectState();
  return readJsonFile<ProjectReferenceCatalogItem[]>(PROJECT_REFERENCE_CATALOG_PATH, []);
}

export async function resolveProjectTemplate(
  templateId?: string,
): Promise<ProjectTemplateResolution | null> {
  const registry = await readTemplateRegistry();
  const selected = templateId?.trim()
    ? registry.find((item) => item.id === templateId.trim())
    : registry.find((item) => item.isDefault)
      ?? registry.find((item) => item.id === PROJECT_DEFAULT_TEMPLATE_ID)
      ?? registry[0];

  if (!selected) return null;

  const absoluteTemplatePath = path.resolve(PROJECT_ROOT_DIR, selected.templatePath);
  const absoluteSummaryPath = path.resolve(PROJECT_ROOT_DIR, selected.summaryPath);

  try {
    await fs.access(absoluteTemplatePath);
  } catch {
    if (selected.id !== PROJECT_DEFAULT_TEMPLATE_ID) {
      return null;
    }

    try {
      await fs.access(PROJECT_DEFAULT_TEMPLATE_PATH);
      return {
        item: {
          ...selected,
          templatePath: path
            .relative(PROJECT_ROOT_DIR, PROJECT_DEFAULT_TEMPLATE_PATH)
            .replace(/\\/g, "/"),
          summaryPath: path
            .relative(PROJECT_ROOT_DIR, PROJECT_DEFAULT_TEMPLATE_SUMMARY_PATH)
            .replace(/\\/g, "/"),
        },
        absoluteTemplatePath: PROJECT_DEFAULT_TEMPLATE_PATH,
        absoluteSummaryPath: PROJECT_DEFAULT_TEMPLATE_SUMMARY_PATH,
      };
    } catch {
      return null;
    }
  }

  return {
    item: selected,
    absoluteTemplatePath,
    absoluteSummaryPath,
  };
}
