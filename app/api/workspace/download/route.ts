import path from "node:path";
import { promises as fs } from "node:fs";
import {
  readNonEmptyString,
  resolveRuntimeContext,
  resolveWorkspacePath,
  isPathInsideRoot,
} from "@/lib/workspace/context";

function inferContentType(targetPath: string) {
  const extension = path.extname(targetPath).toLowerCase();

  switch (extension) {
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".md":
      return "text/markdown; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = readNonEmptyString(url.searchParams.get("workspaceId"));
  const relativePath = readNonEmptyString(url.searchParams.get("path"));

  if (!workspaceId || !relativePath) {
    return new Response("Missing workspaceId or path", { status: 400 });
  }

  const { workspaceDir } = resolveRuntimeContext({ workspaceId });
  const absolutePath = resolveWorkspacePath(workspaceDir, relativePath);
  if (!absolutePath) {
    return new Response("Access denied", { status: 403 });
  }

  try {
    // Symlink escape defense: resolve real path and re-check containment
    const realPath = await fs.realpath(absolutePath);
    if (!isPathInsideRoot(workspaceDir, realPath)) {
      return new Response("Access denied", { status: 403 });
    }

    const file = await fs.readFile(realPath);
    const fileName = path.basename(realPath);

    // RFC 5987 dual-param format for Chinese filenames
    const asciiName = fileName.replace(/[^\x20-\x7E]/g, "_");
    const encodedName = encodeURIComponent(fileName);

    return new Response(file, {
      headers: {
        "Content-Type": inferContentType(realPath),
        "Content-Disposition":
          `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      },
    });
  } catch {
    return new Response("File not found", { status: 404 });
  }
}
