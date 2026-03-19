import { z } from "zod";
import { getReqAgentProviderConfig, logReqAgentProviderSummary } from "@/lib/provider-config";

type ResponsesTextFormat =
  | {
      type: "text";
    }
  | {
      type: "json_schema";
      name: string;
      schema: unknown;
      strict?: boolean;
    };

type ResponsesTextRequest = {
  system: string;
  prompt: string;
  format?: ResponsesTextFormat;
};

export async function generateResponsesText({ system, prompt, format }: ResponsesTextRequest) {
  const config = getReqAgentProviderConfig();
  logReqAgentProviderSummary();

  const body = {
    model: config.model,
    stream: true,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: prompt }],
      },
    ],
    ...(format
      ? {
          text: {
            format,
          },
        }
      : {}),
  };

  const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Provider returned ${response.status}: ${errorBody || response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Provider returned an empty response body.");
  }

  return await readResponsesStream(response.body);
}

export async function generateResponsesObject<T>({
  schema,
  schemaName,
  system,
  prompt,
}: {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  prompt: string;
}) {
  const text = await generateResponsesText({
    system,
    prompt,
    format: {
      type: "json_schema",
      name: schemaName,
      schema: z.toJSONSchema(schema),
      strict: true,
    },
  });

  return schema.parse(JSON.parse(text));
}

async function readResponsesStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let text = "";
  let finalText = "";
  let completed = false;

  const flushEvent = (rawEvent: string) => {
    const lines = rawEvent.split(/\r?\n/);
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");

    if (!data) {
      return;
    }

    if (data === "[DONE]") {
      completed = true;
      return;
    }

    const parsed = JSON.parse(data) as {
      type?: string;
      delta?: string;
      text?: string;
      error?: { message?: string };
      message?: string;
      response?: { error?: { message?: string } | null; status?: string };
    };

    switch (parsed.type) {
      case "response.output_text.delta":
        text += parsed.delta ?? "";
        return;
      case "response.output_text.done":
        finalText = parsed.text ?? finalText;
        return;
      case "response.completed":
        completed = true;
        if (parsed.response?.error?.message) {
          throw new Error(parsed.response.error.message);
        }
        return;
      case "response.incomplete":
        if (parsed.response?.status === "incomplete") {
          throw new Error("Provider returned an incomplete response.");
        }
        return;
      case "error":
        throw new Error(parsed.error?.message ?? parsed.message ?? "Provider stream error.");
      default:
        return;
    }
  };

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index == null) {
        break;
      }

      const rawEvent = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      flushEvent(rawEvent);
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    flushEvent(trailing);
  }

  const resolvedText = finalText || text;
  if (!resolvedText.trim()) {
    throw new Error("Provider returned an empty response body.");
  }

  if (!completed) {
    throw new Error("Provider stream ended before completion.");
  }

  return resolvedText;
}
