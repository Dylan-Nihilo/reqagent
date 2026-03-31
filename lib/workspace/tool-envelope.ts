export type ReqAgentArtifactKind = "document" | "knowledge" | "workspace" | "catalog";

export type ReqAgentPreviewMode = "markdown" | "code" | "text";

export type ReqAgentArtifact = {
  kind: ReqAgentArtifactKind;
  label: string;
  summary: string;
  previewMode?: ReqAgentPreviewMode;
  content?: string;
  path?: string;
  downloadPath?: string;
  icon?: "brief" | "stories" | "document" | "knowledge" | "docx";
};

export type ReqAgentEnvelope = {
  summary?: string;
  uiIntent?: string;
  artifact?: ReqAgentArtifact;
  metrics?: Record<string, string | number>;
  warnings?: string[];
};

export function inferReqAgentPreviewMode(targetPath: string): ReqAgentPreviewMode {
  if (/\.(md|markdown|mdx)$/i.test(targetPath)) return "markdown";
  if (/\.(tsx?|jsx?|json|ya?ml|css|scss|less|html?|xml|sh|bash|zsh|py|rb|go|rs|java|kt|swift|sql|toml|ini|env)$/i.test(targetPath)) {
    return "code";
  }
  return "text";
}

export function inferReqAgentArtifactKind(targetPath: string): ReqAgentArtifactKind {
  if (/\.(md|markdown|mdx|docx)$/i.test(targetPath)) return "document";
  return "workspace";
}

export function fileNameFromPath(targetPath: string) {
  const segments = targetPath.split("/");
  return segments[segments.length - 1] || targetPath;
}

export function safeHostFromUrl(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

/** Attach an envelope to a tool result without mutating the source object. */
export function attachReqAgentEnvelope<T extends Record<string, unknown>>(result: T, envelope: ReqAgentEnvelope) {
  return { ...result, reqagent: envelope } as T & { reqagent: ReqAgentEnvelope };
}

export function getReqAgentEnvelope(result: unknown): ReqAgentEnvelope | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const envelope = (result as Record<string, unknown>).reqagent;
  if (!envelope || typeof envelope !== "object") return null;
  return envelope as ReqAgentEnvelope;
}
