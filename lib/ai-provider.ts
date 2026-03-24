import { createOpenAI } from "@ai-sdk/openai";

function readEnv(name: string) {
  const value = process.env[name];
  return value?.trim() ? value.trim() : undefined;
}

function normalizeBaseURL(baseURL?: string) {
  if (!baseURL) return undefined;
  const trimmed = baseURL.replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    if (!url.pathname || url.pathname === "/") {
      url.pathname = "/v1";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

const apiKey = readEnv("REQAGENT_API_KEY") ?? readEnv("OPENAI_API_KEY");
const baseURL = normalizeBaseURL(readEnv("REQAGENT_BASE_URL") ?? readEnv("OPENAI_BASE_URL"));
const modelId = readEnv("REQAGENT_MODEL") ?? readEnv("OPENAI_MODEL") ?? "gpt-4o-mini";
const wireApi = (readEnv("REQAGENT_WIRE_API") ?? "chat-completions") as WireApi;

export type WireApi = "chat-completions" | "responses";

export const reqAgentProvider = createOpenAI({
  apiKey,
  baseURL,
});

function isOfficialOpenAIBaseURL(candidate?: string) {
  if (!candidate) return true;

  try {
    const url = new URL(candidate);
    return url.host === "api.openai.com" || url.host.endsWith(".openai.com");
  } catch {
    return false;
  }
}

// .chat()       → /v1/chat/completions (wider proxy compatibility)
// .responses()  → /v1/responses (needs store support for multi-step)
export const reqAgentModel = wireApi === "responses"
  ? reqAgentProvider.responses(modelId)
  : reqAgentProvider.chat(modelId);

export type ReqAgentProviderInfo = {
  providerName: string;
  model: string;
  wireApi: WireApi;
};

export function getProviderInfo(): ReqAgentProviderInfo {
  return {
    providerName: isOfficialOpenAIBaseURL(baseURL) ? "openai" : "custom-openai",
    model: modelId,
    wireApi,
  };
}

export function getProviderBaseURL() {
  return baseURL;
}

export function supportsNativeResponsesMcp() {
  return wireApi === "responses" && isOfficialOpenAIBaseURL(baseURL);
}
