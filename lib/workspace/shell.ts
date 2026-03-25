import { execa, ExecaError } from "execa";
import { tool, jsonSchema } from "ai";
import { TOOL_DESCRIPTIONS } from "@/lib/workspace/tool-catalog";

const SHELL_TIMEOUT_DEFAULT = 30_000;
const SHELL_OUTPUT_MAX = 128 * 1024;

export function truncateOutput(value: string) {
  if (value.length <= SHELL_OUTPUT_MAX) return { text: value, truncated: false };
  return { text: value.slice(0, SHELL_OUTPUT_MAX) + "\n[...truncated]", truncated: true };
}

export async function executeInWorkspace(
  command: string,
  cwd: string,
  timeout = SHELL_TIMEOUT_DEFAULT,
): Promise<{ stdout: string; stderr: string; exitCode: number; truncated?: boolean; timedOut?: boolean }> {
  try {
    const result = await execa({
      shell: "/bin/bash",
      cwd,
      timeout: Math.min(timeout, 120_000),
      reject: false,
    })`${command}`;

    const out = truncateOutput(result.stdout);
    const err = truncateOutput(result.stderr);
    return {
      stdout: out.text,
      stderr: err.text,
      exitCode: result.exitCode ?? 0,
      truncated: out.truncated || err.truncated || undefined,
      timedOut: result.timedOut || undefined,
    };
  } catch (error: unknown) {
    if (error instanceof ExecaError) {
      return {
        stdout: error.stdout ?? "",
        stderr: error.stderr || (error.timedOut ? "Process timed out" : error.shortMessage),
        exitCode: error.exitCode ?? 1,
        timedOut: error.timedOut || undefined,
      };
    }
    return {
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };
  }
}

export const fetchUrlTool = tool({
  description: TOOL_DESCRIPTIONS.fetch_url,
  inputSchema: jsonSchema<{ url: string }>({
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to fetch" },
    },
    required: ["url"],
  }),
  execute: async ({ url }) => {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
      headers: { Accept: "text/markdown" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { error: `Fetch failed: ${res.status} ${res.statusText}`, url };
    }
    const text = await res.text();
    const truncated = text.length > 32_000;
    return {
      url,
      content: truncated ? `${text.slice(0, 32_000)}\n\n[...truncated]` : text,
      charCount: text.length,
      truncated,
    };
  },
});
