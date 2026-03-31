import path from "node:path";

export const PROJECT_ROOT_DIR = process.cwd();

export const REQAGENT_RUNTIME_ROOT = path.join(PROJECT_ROOT_DIR, ".reqagent");
export const REQAGENT_LEGACY_ROOT = path.join(REQAGENT_RUNTIME_ROOT, "legacy");

export const PROJECT_SKILLS_ROOT = path.join(PROJECT_ROOT_DIR, "skills");
export const PROJECT_TEMPLATES_ROOT = path.join(PROJECT_ROOT_DIR, "templates");
export const PROJECT_TEMPLATE_PROFILES_ROOT = path.join(PROJECT_TEMPLATES_ROOT, "profiles");
export const PROJECT_DEFAULT_TEMPLATE_PROFILE_ROOT = path.join(PROJECT_TEMPLATE_PROFILES_ROOT, "default");
export const PROJECT_REFERENCES_ROOT = path.join(PROJECT_ROOT_DIR, "references");
export const PROJECT_REFERENCES_RAW_ROOT = path.join(PROJECT_REFERENCES_ROOT, "raw");
export const PROJECT_REFERENCES_DERIVED_ROOT = path.join(PROJECT_REFERENCES_ROOT, "derived");

export const PROJECT_CONFIG_PATH = path.join(PROJECT_ROOT_DIR, "reqagent.project.json");
export const PROJECT_MCP_CONFIG_PATH = path.join(PROJECT_ROOT_DIR, "reqagent.mcp.json");
export const PROJECT_TEMPLATE_REGISTRY_PATH = path.join(PROJECT_TEMPLATES_ROOT, "registry.json");
export const PROJECT_REFERENCE_CATALOG_PATH = path.join(PROJECT_REFERENCES_ROOT, "catalog.json");

export const PROJECT_DEFAULT_TEMPLATE_ID = "default";
export const PROJECT_DEFAULT_TEMPLATE_PATH = path.join(
  PROJECT_DEFAULT_TEMPLATE_PROFILE_ROOT,
  "template.docx",
);
export const PROJECT_DEFAULT_TEMPLATE_SUMMARY_PATH = path.join(
  PROJECT_DEFAULT_TEMPLATE_PROFILE_ROOT,
  "summary.md",
);
