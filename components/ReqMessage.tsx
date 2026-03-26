"use client";

import type { ReactNode } from "react";
import {
  ReqMessageFrame,
  type ReqMessageAction,
  type ReqMessageRole,
  type ReqMessageVisualStatus,
} from "@/components/message-ui/ReqMessageUI";

type ReqMessageProps = {
  role: ReqMessageRole;
  avatarLabel?: string;
  children: ReactNode;
  className?: string;
  status?: ReqMessageVisualStatus;
  title?: string;
  meta?: ReactNode;
  branchLabel?: string;
  isRetry?: boolean;
  signals?: string[];
  actions?: ReqMessageAction[];
};

export function ReqMessage({
  role,
  avatarLabel,
  children,
  className,
  status,
  title,
  meta,
  branchLabel,
  isRetry,
  signals,
  actions,
}: ReqMessageProps) {
  return (
    <ReqMessageFrame
      actions={actions}
      branchLabel={branchLabel}
      className={className}
      isRetry={isRetry}
      meta={meta}
      monogram={avatarLabel}
      role={role}
      signals={signals}
      status={status}
      title={title}
    >
      {children}
    </ReqMessageFrame>
  );
}

export type { ReqMessageAction, ReqMessageRole, ReqMessageVisualStatus };
