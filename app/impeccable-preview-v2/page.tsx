import type { Metadata } from "next";
import { PreviewRouteV2 } from "./PreviewRouteV2";

export const metadata: Metadata = {
  title: "ReqAgent Preview v2 · Impeccable",
  description: "ReqAgent 共享视觉语言下的下一阶段交互预览。",
};

export default function ImpeccablePreviewV2Page() {
  return <PreviewRouteV2 />;
}
