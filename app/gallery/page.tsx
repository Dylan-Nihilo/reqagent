import type { Metadata } from "next";
import { ReqAgentComponentGallery } from "@/components/ReqAgentComponentGallery";

export const metadata: Metadata = {
  title: "ReqAgent Component Library",
  description: "ReqAgent 组件库目录。",
};

export default function GalleryPage() {
  return <ReqAgentComponentGallery />;
}
