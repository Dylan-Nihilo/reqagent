"use client";

import { useMessagePartImage } from "@assistant-ui/react";
import { ReqMessageImageTile } from "@/components/message-ui/ReqMessageUI";

export function ReqImagePart() {
  const { image, filename } = useMessagePartImage();

  return <ReqMessageImageTile alt={filename ?? "message-image"} caption={filename ?? "图像附件"} src={image} />;
}
