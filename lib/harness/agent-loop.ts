// AgentLoopController — wraps Vercel AI SDK streamText with step control,
// interrupt capability, hook execution points, and structured event emission.

import {
  streamText,
  generateText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import type { AgentEvent, StepResult } from "./agent-events";
import type { HookRegistry, HookContext } from "./hooks";
import type { ContextBudget } from "./context-budget";

// ---------------------------------------------------------------------------
// Config & State
// ---------------------------------------------------------------------------

export type AgentLoopConfig = {
  maxSteps: number;
  stepTimeoutMs: number;
  interruptible: boolean;
};

export const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
  maxSteps: 8,
  stepTimeoutMs: 120_000,
  interruptible: true,
};

export type AgentLoopStatus = "idle" | "running" | "interrupted" | "complete" | "error";

export type AgentLoopState = {
  currentStep: number;
  status: AgentLoopStatus;
  startTime: number;
  toolCallHistory: Array<{ step: number; toolName: string; toolCallId: string }>;
  events: AgentEvent[];
};

// ---------------------------------------------------------------------------
// Input types for run()
// ---------------------------------------------------------------------------

export type AgentLoopInput = {
  model: Parameters<typeof streamText>[0]["model"];
  system: string;
  messages: ReadonlyArray<UIMessage>;
  tools: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
  /** Callback when streamText finishes (for MCP cleanup, etc.) */
  onFinish?: () => Promise<void>;
};

/** Passed to step-level callbacks so route.ts can record metadata/traces. */
export type StepCallback = (step: number, result: StepResult) => void;

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class AgentLoopController {
  readonly config: AgentLoopConfig;
  private state: AgentLoopState;
  private hookRegistry: HookRegistry | null;
  private contextBudget: ContextBudget | null;
  private interruptReason: string | null = null;

  constructor(opts?: {
    config?: Partial<AgentLoopConfig>;
    hooks?: HookRegistry;
    contextBudget?: ContextBudget;
  }) {
    this.config = { ...DEFAULT_LOOP_CONFIG, ...opts?.config };
    this.hookRegistry = opts?.hooks ?? null;
    this.contextBudget = opts?.contextBudget ?? null;
    this.state = {
      currentStep: 0,
      status: "idle",
      startTime: 0,
      toolCallHistory: [],
      events: [],
    };
  }

  getState(): Readonly<AgentLoopState> {
    return this.state;
  }

  getConfig(): Readonly<AgentLoopConfig> {
    return this.config;
  }

  interrupt(reason: string) {
    if (!this.config.interruptible) return;
    this.interruptReason = reason;
  }

  private emit(event: AgentEvent) {
    this.state.events.push(event);
  }

  private async executeHook(
    hookEvent: string,
    ctx: Partial<HookContext>,
  ): Promise<{ action: string; reason?: string; input?: unknown; message?: string }> {
    if (!this.hookRegistry) return { action: "allow" };
    const fullCtx: HookContext = {
      event: hookEvent,
      step: this.state.currentStep,
      toolName: ctx.toolName,
      toolInput: ctx.toolInput,
      toolCallId: ctx.toolCallId,
      toolResult: ctx.toolResult,
      loopState: this.state,
      loopConfig: this.config,
    };
    return this.hookRegistry.execute(hookEvent, fullCtx);
  }

  /**
   * Run the agent loop. Returns the underlying streamText result so the route
   * can call `.toUIMessageStreamResponse()` on it.
   *
   * The controller intercepts each step via onStepFinish to:
   * 1. Emit structured AgentEvents
   * 2. Execute hooks at step boundaries
   * 3. Track tool call history
   * 4. Check context budget
   * 5. Handle interrupts
   */
  async run(
    input: AgentLoopInput,
    callbacks?: {
      onStep?: StepCallback;
      onEvent?: (event: AgentEvent) => void;
    },
  ): Promise<ReturnType<typeof streamText>> {
    this.state.status = "running";
    this.state.startTime = Date.now();
    this.state.currentStep = 0;
    this.interruptReason = null;

    const loopStartEvent: AgentEvent = {
      type: "loop_start",
      maxSteps: this.config.maxSteps,
      interruptible: this.config.interruptible,
    };
    this.emit(loopStartEvent);
    callbacks?.onEvent?.(loopStartEvent);

    // Execute loop_start hooks
    await this.executeHook("loop_start", {});

    const result = streamText({
      model: input.model,
      system: input.system,
      messages: await convertToModelMessages([...input.messages]),
      tools: input.tools as Parameters<typeof streamText>[0]["tools"],
      stopWhen: stepCountIs(this.config.maxSteps),
      experimental_repairToolCall: async ({ toolCall, inputSchema, messages }) => {
        console.log(`[ReqAgent repair] tool=${toolCall.toolName} input=${toolCall.input?.slice(0, 80)}`);
        const schema = await inputSchema({ toolName: toolCall.toolName });
        const { text } = await generateText({
          model: input.model,
          system: "You repair a malformed or truncated tool call JSON. Return ONLY valid JSON that matches the schema. No explanation.",
          prompt: `Tool: ${toolCall.toolName}\nSchema: ${JSON.stringify(schema)}\nMalformed input: ${toolCall.input}\nUser message context: ${JSON.stringify(messages.slice(-2))}\n\nReturn valid JSON only:`,
        });
        try {
          JSON.parse(text.trim());
          return { ...toolCall, input: text.trim() };
        } catch {
          return null;
        }
      },
      providerOptions: input.providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
      onFinish: async () => {
        await input.onFinish?.();
      },
      onStepFinish: async ({ toolCalls, toolResults, text, finishReason }) => {
        this.state.currentStep++;
        const step = this.state.currentStep;

        // Build step result
        const stepResult: StepResult = {
          finishReason,
          text: text || undefined,
          toolCalls: toolCalls.map((tc) => ({
            toolName: tc.toolName,
            toolCallId: tc.toolCallId,
            input: tc.input,
          })),
          toolResults: toolResults.map((tr) => {
            const candidate = tr as Record<string, unknown>;
            return {
              toolCallId: String(candidate.toolCallId ?? ""),
              toolName: String(candidate.toolName ?? "unknown"),
              output: candidate.output ?? candidate.result ?? tr,
            };
          }),
        };

        // Emit step_start
        const stepStartEvent: AgentEvent = { type: "step_start", step };
        this.emit(stepStartEvent);
        callbacks?.onEvent?.(stepStartEvent);
        await this.executeHook("step_start", {});

        // Process tool calls — emit events + execute pre/post hooks
        for (const tc of stepResult.toolCalls) {
          this.state.toolCallHistory.push({
            step,
            toolName: tc.toolName,
            toolCallId: tc.toolCallId,
          });

          // pre_tool_use hook
          const preResult = await this.executeHook("pre_tool_use", {
            toolName: tc.toolName,
            toolInput: tc.input,
            toolCallId: tc.toolCallId,
          });

          const toolCallEvent: AgentEvent = {
            type: "tool_call",
            step,
            toolName: tc.toolName,
            toolInput: tc.input,
            toolCallId: tc.toolCallId,
          };
          this.emit(toolCallEvent);
          callbacks?.onEvent?.(toolCallEvent);

          if (preResult.action === "deny") {
            const interruptEvent: AgentEvent = {
              type: "interrupt",
              step,
              reason: `Hook denied tool ${tc.toolName}: ${preResult.reason ?? "no reason"}`,
            };
            this.emit(interruptEvent);
            callbacks?.onEvent?.(interruptEvent);
          }
        }

        // Process tool results — emit events + post hooks
        for (const tr of stepResult.toolResults) {
          const toolResultEvent: AgentEvent = {
            type: "tool_result",
            step,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            result: tr.output,
          };
          this.emit(toolResultEvent);
          callbacks?.onEvent?.(toolResultEvent);

          await this.executeHook("post_tool_use", {
            toolName: tr.toolName,
            toolCallId: tr.toolCallId,
            toolResult: tr.output,
          });
        }

        // Emit step_finish
        const stepFinishEvent: AgentEvent = { type: "step_finish", step, result: stepResult };
        this.emit(stepFinishEvent);
        callbacks?.onEvent?.(stepFinishEvent);
        await this.executeHook("step_finish", {});

        // Context budget check
        if (this.contextBudget) {
          const snapshot = this.contextBudget.snapshot();
          if (snapshot.shouldCompact) {
            const compactionEvent: AgentEvent = {
              type: "compaction_trigger",
              step,
              messageCount: snapshot.messageCount ?? 0,
              tokenEstimate: snapshot.used,
            };
            this.emit(compactionEvent);
            callbacks?.onEvent?.(compactionEvent);
          }
        }

        // Check interrupt
        if (this.interruptReason) {
          const interruptEvent: AgentEvent = {
            type: "interrupt",
            step,
            reason: this.interruptReason,
          };
          this.emit(interruptEvent);
          callbacks?.onEvent?.(interruptEvent);
        }

        // Forward to route callback
        callbacks?.onStep?.(step, stepResult);
      },
    });

    // We resolve the loop_end event after the stream finishes.
    // The caller (route.ts) handles this via toUIMessageStreamResponse's onFinish.
    // We set status here optimistically; the final status is refined in wrapResult.
    this.state.status = "complete";

    return result;
  }

  /** Build the loop_end event from final state. Call after stream completes. */
  finalize(): AgentEvent {
    const reason = this.interruptReason
      ? "interrupted" as const
      : this.state.currentStep >= this.config.maxSteps
        ? "max_steps" as const
        : "complete" as const;

    const event: AgentEvent = {
      type: "loop_end",
      totalSteps: this.state.currentStep,
      reason,
    };
    this.emit(event);
    this.state.status = reason === "interrupted" ? "interrupted" : "complete";
    return event;
  }
}
