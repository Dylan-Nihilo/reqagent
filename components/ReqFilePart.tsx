"use client";

import { useMessagePartFile } from "@assistant-ui/react";
import { ReqMessageFileTile, estimateDataSizeLabel } from "@/components/message-ui/ReqMessageUI";

export function ReqFilePart() {
  const { filename, data, mimeType } = useMessagePartFile();

  return <ReqMessageFileTile filename={filename} mimeType={mimeType} sizeLabel={estimateDataSizeLabel(data)} />;
}
