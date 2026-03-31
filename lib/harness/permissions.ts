// Permission policy — evaluates whether a tool call should be allowed,
// denied, or require human approval.

import type { ToolRegistryItem, ToolRiskLevel } from "@/lib/tool-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PermissionAction = "allow" | "deny" | "ask";

export type PermissionRule = {
  /** Tool name match — string for exact, RegExp for pattern. */
  tool: string | RegExp;
  action: PermissionAction;
  conditions?: {
    riskLevel?: ToolRiskLevel;
    /** Match against JSON-serialized tool input. */
    argPattern?: RegExp;
  };
};

export type PermissionDecision = {
  action: PermissionAction;
  rule: PermissionRule | null;
  toolName: string;
};

// ---------------------------------------------------------------------------
// Default Policy
// ---------------------------------------------------------------------------

export const DEFAULT_PERMISSION_RULES: PermissionRule[] = [
  // Shell always requires approval
  { tool: "bash", action: "ask" },
  // MCP tools default to approval
  { tool: /^mcp_/, action: "ask" },
  // Safe tools auto-allow
  { tool: /.*/, action: "allow", conditions: { riskLevel: "safe" } },
  // Caution tools need approval
  { tool: /.*/, action: "ask", conditions: { riskLevel: "caution" } },
  // Sensitive tools need approval
  { tool: /.*/, action: "ask", conditions: { riskLevel: "sensitive" } },
];

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export class PermissionPolicy {
  private rules: PermissionRule[];

  constructor(rules?: PermissionRule[]) {
    this.rules = rules ?? [...DEFAULT_PERMISSION_RULES];
  }

  /**
   * Evaluate a tool call against the policy.
   * Rules are checked in order — first match wins.
   */
  evaluate(
    toolName: string,
    toolInput: unknown,
    meta?: ToolRegistryItem | null,
  ): PermissionDecision {
    for (const rule of this.rules) {
      if (!this.matchesTool(rule.tool, toolName)) continue;
      if (!this.matchesConditions(rule, toolInput, meta)) continue;
      return { action: rule.action, rule, toolName };
    }

    // No rule matched — default to ask (cautious fallback)
    return { action: "ask", rule: null, toolName };
  }

  /** Merge project-level overrides on top of base rules. Overrides take priority. */
  withOverrides(overrides: PermissionRule[]): PermissionPolicy {
    return new PermissionPolicy([...overrides, ...this.rules]);
  }

  getRules(): ReadonlyArray<PermissionRule> {
    return this.rules;
  }

  private matchesTool(pattern: string | RegExp, toolName: string): boolean {
    if (typeof pattern === "string") return pattern === toolName;
    return pattern.test(toolName);
  }

  private matchesConditions(
    rule: PermissionRule,
    toolInput: unknown,
    meta?: ToolRegistryItem | null,
  ): boolean {
    if (!rule.conditions) return true;

    if (rule.conditions.riskLevel && meta) {
      if (meta.riskLevel !== rule.conditions.riskLevel) return false;
    }

    if (rule.conditions.argPattern && toolInput) {
      const serialized = typeof toolInput === "string"
        ? toolInput
        : JSON.stringify(toolInput);
      if (!rule.conditions.argPattern.test(serialized)) return false;
    }

    return true;
  }
}
