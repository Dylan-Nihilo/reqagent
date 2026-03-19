"use client";

import { ReqArtifactFileList } from "@/components/ReqArtifactFileList";
import type { ReqAgentArtifacts } from "@/lib/types";

type ArtifactPanelProps = {
  artifacts: ReqAgentArtifacts;
};

export function ArtifactPanel({ artifacts }: ArtifactPanelProps) {
  const items = [
    artifacts.stories
      ? {
          id: "stories",
          name: "user-stories.md",
          meta: `${artifacts.stories.total} stories · ReqDecomposer`,
          description: artifacts.stories.projectName,
        }
      : null,
    artifacts.doc
      ? {
          id: "doc",
          name: "需求文档.md",
          meta: `${artifacts.doc.charCount} chars · DocGenerator`,
          description: artifacts.doc.projectName,
        }
      : null,
  ].filter(Boolean) as Array<{
    id: string;
    name: string;
    meta: string;
    description: string;
  }>;

  if (items.length === 0) {
    return null;
  }

  return (
    <ReqArtifactFileList count={items.length} items={items} title="文件" />
  );
}
