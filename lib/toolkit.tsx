"use client";

import type { Toolkit } from "@assistant-ui/react";
import { ReqToolPart } from "@/components/tool-ui/ReqToolUI";
import { toolRegistry } from "@/lib/tool-registry";

export const reqAgentToolkit: Toolkit = Object.fromEntries(
  toolRegistry.map((tool) => [
    tool.name,
    {
      type: "backend" as const,
      render: ReqToolPart,
    },
  ]),
);
