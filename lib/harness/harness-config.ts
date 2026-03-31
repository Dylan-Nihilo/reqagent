// Harness configuration — reads from project config and provides defaults.

import { readProjectConfig } from "@/lib/project-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HarnessCompactionConfig = {
  strategy: "progressive" | "all-at-once";
  warningThreshold: number;
  compactionThreshold: number;
  retainRecentCount: number;
  maxTokens?: number;
};

export type HarnessPermissionConfig = {
  defaultPolicy: "permissive" | "cautious" | "strict";
  overrides: Array<{ tool: string; action: "allow" | "deny" | "ask" }>;
};

export type HarnessHooksConfig = {
  audit: boolean;
  budgetLimit?: { maxSteps?: number; maxTokens?: number };
};

export type HarnessConfig = {
  maxSteps: number;
  stepTimeoutMs: number;
  interruptible: boolean;
  compaction: HarnessCompactionConfig;
  permissions: HarnessPermissionConfig;
  hooks: HarnessHooksConfig;
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  maxSteps: 12,
  stepTimeoutMs: 120_000,
  interruptible: true,
  compaction: {
    strategy: "progressive",
    warningThreshold: 0.75,
    compactionThreshold: 0.85,
    retainRecentCount: 8,
  },
  permissions: {
    defaultPolicy: "cautious",
    overrides: [],
  },
  hooks: {
    audit: true,
    budgetLimit: { maxSteps: 20, maxTokens: 100_000 },
  },
};

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeString<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  if (typeof value === "string" && (allowed as string[]).includes(value)) return value as T;
  return fallback;
}

export function normalizeHarnessConfig(raw: unknown): HarnessConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_HARNESS_CONFIG };

  const input = raw as Record<string, unknown>;
  const compactionRaw = (input.compaction ?? {}) as Record<string, unknown>;
  const permissionsRaw = (input.permissions ?? {}) as Record<string, unknown>;
  const hooksRaw = (input.hooks ?? {}) as Record<string, unknown>;
  const budgetRaw = (hooksRaw.budgetLimit ?? {}) as Record<string, unknown>;
  const overridesRaw = Array.isArray(permissionsRaw.overrides) ? permissionsRaw.overrides : [];

  return {
    maxSteps: normalizeNumber(input.maxSteps, DEFAULT_HARNESS_CONFIG.maxSteps),
    stepTimeoutMs: normalizeNumber(input.stepTimeoutMs, DEFAULT_HARNESS_CONFIG.stepTimeoutMs),
    interruptible: normalizeBoolean(input.interruptible, DEFAULT_HARNESS_CONFIG.interruptible),
    compaction: {
      strategy: normalizeString(compactionRaw.strategy, ["progressive", "all-at-once"], DEFAULT_HARNESS_CONFIG.compaction.strategy),
      warningThreshold: normalizeNumber(compactionRaw.warningThreshold, DEFAULT_HARNESS_CONFIG.compaction.warningThreshold),
      compactionThreshold: normalizeNumber(compactionRaw.compactionThreshold, DEFAULT_HARNESS_CONFIG.compaction.compactionThreshold),
      retainRecentCount: normalizeNumber(compactionRaw.retainRecentCount, DEFAULT_HARNESS_CONFIG.compaction.retainRecentCount),
      maxTokens: typeof compactionRaw.maxTokens === "number" ? compactionRaw.maxTokens : undefined,
    },
    permissions: {
      defaultPolicy: normalizeString(permissionsRaw.defaultPolicy, ["permissive", "cautious", "strict"], DEFAULT_HARNESS_CONFIG.permissions.defaultPolicy),
      overrides: overridesRaw
        .filter((item): item is { tool: string; action: string } =>
          item && typeof item === "object" &&
          typeof (item as Record<string, unknown>).tool === "string" &&
          typeof (item as Record<string, unknown>).action === "string")
        .map((item) => ({
          tool: item.tool,
          action: normalizeString(item.action, ["allow", "deny", "ask"], "ask"),
        })),
    },
    hooks: {
      audit: normalizeBoolean(hooksRaw.audit, DEFAULT_HARNESS_CONFIG.hooks.audit),
      budgetLimit: {
        maxSteps: typeof budgetRaw.maxSteps === "number" ? budgetRaw.maxSteps : undefined,
        maxTokens: typeof budgetRaw.maxTokens === "number" ? budgetRaw.maxTokens : undefined,
      },
    },
  };
}

/**
 * Read harness config from project config file.
 * Falls back to defaults if no harness section exists.
 */
export async function readHarnessConfig(): Promise<HarnessConfig> {
  try {
    const projectConfig = await readProjectConfig();
    const raw = (projectConfig as Record<string, unknown>).harness;
    return normalizeHarnessConfig(raw);
  } catch {
    return { ...DEFAULT_HARNESS_CONFIG };
  }
}
