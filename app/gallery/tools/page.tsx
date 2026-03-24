import type { Metadata } from "next";
import { ReqToolStateGallery } from "@/components/ReqToolStateGallery";

export const metadata: Metadata = {
  title: "ReqAgent Agent Tools",
  description: "ReqAgent agent 工具库与工具交互预览。",
};

export default function ToolGalleryPage() {
  return <ReqToolStateGallery />;
}
