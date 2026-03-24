import type { Metadata } from "next";
import { PreviewWorkbench } from "./PreviewWorkbench";

export const metadata: Metadata = {
  title: "ReqAgent Preview · Impeccable",
  description: "ReqAgent 下一阶段工作台方向预览。",
};

export default function ImpeccablePreviewPage() {
  return <PreviewWorkbench />;
}
