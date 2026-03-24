"use client";

import { z } from "zod";

export const bashToolInputSchema = z.object({
  command: z.string(),
});

export type BashToolInput = z.infer<typeof bashToolInputSchema>;

export function safeParseBashToolInput(input: unknown): BashToolInput | null {
  const parsed = bashToolInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export const reqToolTerminalSchema = z.object({
  command: z.string(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  exitCode: z.number().int().optional(),
  durationMs: z.number().optional(),
  cwd: z.string().optional(),
  truncated: z.boolean().optional(),
});

export type ReqToolTerminalPayload = z.infer<typeof reqToolTerminalSchema>;

export function safeParseReqToolTerminalPayload(input: unknown): ReqToolTerminalPayload | null {
  const parsed = reqToolTerminalSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}
