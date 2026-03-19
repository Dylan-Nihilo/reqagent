import type { Metadata } from "next";
import { ReqAgentComponentGallery } from "@/components/ReqAgentComponentGallery";

export const metadata: Metadata = {
  title: "ReqAgent UI Gallery",
  description: "ReqAgent 组件陈列与界面方向预览。",
};

export default function GalleryPage() {
  return <ReqAgentComponentGallery />;
}
