"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

type ReqToolApprovalHandler = (options: {
  approvalId: string;
  approved: boolean;
  reason?: string;
}) => Promise<void>;

const ReqToolApprovalContext = createContext<ReqToolApprovalHandler | null>(null);

export function ReqToolApprovalProvider({
  children,
  onRespond,
}: {
  children: ReactNode;
  onRespond: ReqToolApprovalHandler;
}) {
  return <ReqToolApprovalContext.Provider value={onRespond}>{children}</ReqToolApprovalContext.Provider>;
}

export function useReqToolApproval() {
  return useContext(ReqToolApprovalContext);
}
