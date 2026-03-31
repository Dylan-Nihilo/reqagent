import type { ToolRegistryItem } from "@/lib/tool-registry";
import type { ToolInvocationViewState } from "@/lib/types";

export type ReqToolSurfaceChromeMode = "summary" | "detail";

export function getToolSurfaceChromeMode({
  name,
  registryItem,
  state,
}: {
  name: string;
  registryItem?: Pick<ToolRegistryItem, "rendererKind">;
  state: ToolInvocationViewState;
}): ReqToolSurfaceChromeMode {
  if (state === "awaiting_approval" || state === "failed" || state === "denied") {
    return "detail";
  }

  if (state === "streaming_output") {
    if (name === "bash") return "detail";
    if (registryItem?.rendererKind === "terminal") return "detail";
  }

  return "summary";
}

export function shouldAutoExpandToolSurface(input: {
  name: string;
  registryItem?: Pick<ToolRegistryItem, "rendererKind">;
  state: ToolInvocationViewState;
}) {
  return getToolSurfaceChromeMode(input) === "detail";
}
