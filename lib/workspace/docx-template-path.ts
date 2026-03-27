import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DOCX_TEMPLATE_PATH = path.resolve(
  MODULE_DIR,
  "../../docs/用户需求说明书_Base_clean.docx",
);
