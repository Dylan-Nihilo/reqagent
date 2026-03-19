import {
  convertToModelMessages,
  streamText,
  tool,
  jsonSchema,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { getProviderInfo, reqAgentModel } from "@/lib/ai-provider";
import { searchKnowledgePatterns, detectDomain } from "@/lib/tools";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Simulated tool call — hand-crafted stream to test the tool UI
// Triggered by messages containing "test tools" or "测试工具"
// ---------------------------------------------------------------------------

function simulateToolCallStream(userText: string): Response {
  const domain = detectDomain(userText);
  const knowledgeResult = searchKnowledgePatterns(userText, domain);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const w = (part: Record<string, unknown>) => writer.write(part as never);

      w({ type: "start" });
      w({ type: "start-step" });

      w({
        type: "tool-input-start",
        toolCallId: "tc_search_001",
        toolName: "search_knowledge",
      });

      w({
        type: "tool-input-available",
        toolCallId: "tc_search_001",
        toolName: "search_knowledge",
        input: { query: userText, domain },
      });

      await new Promise((r) => setTimeout(r, 1500));

      w({
        type: "tool-output-available",
        toolCallId: "tc_search_001",
        output: knowledgeResult,
      });

      w({ type: "finish-step" });

      w({ type: "start-step" });
      const id = "summary_001";
      w({ type: "text-start", id });

      const summary =
        `根据知识库搜索（来源: ${knowledgeResult.source}，相关度: ${knowledgeResult.relevance}）：\n\n` +
        `> ${knowledgeResult.pattern}\n\n` +
        `这些是${domain === "default" ? "通用 SaaS" : domain}领域的常见模式，可以基于此进一步拆解。`;

      const chunks = summary.match(/.{1,20}/g) ?? [summary];
      for (const chunk of chunks) {
        w({ type: "text-delta", id, delta: chunk });
        await new Promise((r) => setTimeout(r, 50));
      }

      w({ type: "text-end", id });
      w({ type: "finish-step" });
      w({ type: "finish", finishReason: "stop" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

function getLastUserText(messages: Array<{ role: string; parts?: Array<{ type: string; text?: string }> }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return (messages[i].parts ?? [])
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text!)
        .join("\n");
    }
  }
  return "";
}

export async function POST(req: Request) {
  const { messages } = await req.json();
  const lastText = getLastUserText(messages);

  // Simulated tool call for UI testing
  if (/test.?tool|测试工具/i.test(lastText)) {
    return simulateToolCallStream(lastText);
  }

  const providerInfo = getProviderInfo();

  const result = streamText({
    model: reqAgentModel,
    system: `你是 ReqAgent，一个 AI 需求分析助手。用中文回复。
当用户描述产品需求时，调用 search_knowledge 工具搜索领域知识后再回复。`,
    messages: await convertToModelMessages(messages, {
      ignoreIncompleteToolCalls: true,
    }),
    tools: {
      search_knowledge: tool({
        description: "Search knowledge base for domain patterns. Call when user describes requirements.",
        inputSchema: jsonSchema<{ query: string }>({
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        }),
        execute: async ({ query }) => searchKnowledgePatterns(query, detectDomain(query)),
      }),
    },
    stopWhen: stepCountIs(3),
    providerOptions: {
      openai: { store: providerInfo.wireApi === "responses" ? true : undefined },
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
    messageMetadata: ({ part }) => {
      const base = { wireApi: providerInfo.wireApi, model: providerInfo.model };
      switch (part.type) {
        case "tool-input-start":
        case "tool-call":
          return { ...base, agentActivity: "tool_calling", phaseLabel: "工具调用" };
        case "tool-result":
        case "tool-error":
          return { ...base, agentActivity: "responding", phaseLabel: "整理结果" };
        case "text-start":
        case "text-delta":
          return { ...base, agentActivity: "responding", phaseLabel: "生成回复" };
        case "reasoning-start":
        case "reasoning-delta":
          return { ...base, agentActivity: "thinking", phaseLabel: "推理" };
        default:
          return { ...base, agentActivity: "responding", phaseLabel: "对话" };
      }
    },
  });
}
