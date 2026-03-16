import { createOpenAI, openai } from "@ai-sdk/openai";
import { convertToCoreMessages, streamText, type Message } from "ai";
import { SYSTEM_PROMPT } from "@/lib/agents";
import {
  generateDocTool,
  generateStoriesTool,
  parseInputTool,
  searchKnowledgeTool,
} from "@/lib/tools";

export const maxDuration = 60;

const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const openaiBaseURL = process.env.OPENAI_BASE_URL?.trim();
const enableServerTools = process.env.REQAGENT_ENABLE_SERVER_TOOLS === "1";

const PLAIN_CHAT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

Temporary runtime mode:
- The server-side tool execution path is currently disabled while the route is being stabilized.
- Do not call tools or mention tool failures.
- Complete the same requirement analysis flow directly in normal assistant text and markdown.`;

const openaiProvider = openaiBaseURL
  ? createOpenAI({
      baseURL: openaiBaseURL,
      apiKey: process.env.OPENAI_API_KEY,
    })
  : openai;

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  const result = streamText({
    model: openaiProvider(openaiModel),
    system: enableServerTools ? SYSTEM_PROMPT : PLAIN_CHAT_SYSTEM_PROMPT,
    messages: convertToCoreMessages(messages),
    ...(enableServerTools
      ? {
          tools: {
            parse_input: parseInputTool,
            search_knowledge: searchKnowledgeTool,
            generate_stories: generateStoriesTool,
            generate_doc: generateDocTool,
          },
          maxSteps: 8,
        }
      : {
          maxSteps: 1,
        }),
  });

  return result.toDataStreamResponse();
}
