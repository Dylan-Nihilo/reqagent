// Context window budget tracker — monitors token utilization
// and signals when compaction is needed.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextBudgetConfig = {
  /** Model's maximum context window in tokens. */
  maxTokens: number;
  /** Utilization ratio that triggers a warning (default: 0.75). */
  warningThreshold: number;
  /** Utilization ratio that triggers compaction (default: 0.85). */
  compactionThreshold: number;
  /** Number of recent messages to always retain during compaction. */
  retainRecentCount: number;
};

export const DEFAULT_BUDGET_CONFIG: ContextBudgetConfig = {
  maxTokens: 128_000,
  warningThreshold: 0.75,
  compactionThreshold: 0.85,
  retainRecentCount: 8,
};

export type BudgetSnapshot = {
  used: number;
  remaining: number;
  utilization: number;
  shouldWarn: boolean;
  shouldCompact: boolean;
  messageCount?: number;
};

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

// Rough heuristic: ~4 chars per token for mixed CJK/English content.
// More accurate than pure English (4 chars/token) because CJK tokens
// are often 1-2 characters.
const CHARS_PER_TOKEN_ESTIMATE = 3.5;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

// ---------------------------------------------------------------------------
// Budget tracker
// ---------------------------------------------------------------------------

export class ContextBudget {
  private config: ContextBudgetConfig;
  private currentUsed = 0;
  private currentMessageCount = 0;

  constructor(config?: Partial<ContextBudgetConfig>) {
    this.config = { ...DEFAULT_BUDGET_CONFIG, ...config };
  }

  getConfig(): Readonly<ContextBudgetConfig> {
    return this.config;
  }

  /**
   * Update the budget with current message content.
   * Call this before each agent loop iteration.
   */
  track(messages: ReadonlyArray<{ content?: string; parts?: unknown[] }>): BudgetSnapshot {
    let totalChars = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      }
      if (Array.isArray(msg.parts)) {
        for (const part of msg.parts) {
          const candidate = part as { text?: string; argsText?: string; result?: unknown };
          if (typeof candidate.text === "string") totalChars += candidate.text.length;
          if (typeof candidate.argsText === "string") totalChars += candidate.argsText.length;
          if (candidate.result !== undefined) {
            totalChars += JSON.stringify(candidate.result).length;
          }
        }
      }
    }

    this.currentUsed = estimateTokens(String(totalChars > 0 ? "x".repeat(totalChars) : ""));
    // More direct: just use the char count
    this.currentUsed = Math.ceil(totalChars / CHARS_PER_TOKEN_ESTIMATE);
    this.currentMessageCount = messages.length;

    return this.snapshot();
  }

  /** Get current budget snapshot without recalculating. */
  snapshot(): BudgetSnapshot {
    const utilization = this.config.maxTokens > 0
      ? this.currentUsed / this.config.maxTokens
      : 0;

    return {
      used: this.currentUsed,
      remaining: Math.max(0, this.config.maxTokens - this.currentUsed),
      utilization,
      shouldWarn: utilization >= this.config.warningThreshold,
      shouldCompact: utilization >= this.config.compactionThreshold,
      messageCount: this.currentMessageCount,
    };
  }

  /** Manually set the used token count (e.g., from a more accurate source). */
  setUsed(tokens: number, messageCount?: number) {
    this.currentUsed = tokens;
    if (messageCount !== undefined) this.currentMessageCount = messageCount;
  }
}
