import type { Metadata } from "next";
import { ReqMessageStateGallery } from "@/components/ReqMessageStateGallery";

export const metadata: Metadata = {
  title: "ReqAgent 消息系统",
  description: "ReqAgent 消息系统与消息部件预览。",
};

export default function MessageGalleryPage() {
  return <ReqMessageStateGallery />;
}
