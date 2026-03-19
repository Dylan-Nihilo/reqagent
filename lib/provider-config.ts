export type ReqAgentProviderConfig = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ReqAgentProviderInfo = {
  providerName: string;
  model: string;
  wireApi: "responses";
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

let didLogProviderSummary = false;

function firstDefined(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find((value) => value && value.length > 0);
}

export function getReqAgentProviderConfig(): ReqAgentProviderConfig {
  const baseUrl = firstDefined(
    process.env.REQAGENT_BASE_URL,
    process.env.OPENAI_BASE_URL,
    DEFAULT_OPENAI_BASE_URL,
  );
  const apiKey = firstDefined(process.env.REQAGENT_API_KEY, process.env.OPENAI_API_KEY);
  const model = firstDefined(process.env.REQAGENT_MODEL, process.env.OPENAI_MODEL, "gpt-4o-mini");
  const providerName = firstDefined(
    process.env.REQAGENT_PROVIDER_NAME,
    process.env.OPENAI_BASE_URL ? "custom-openai" : "openai",
  );

  if (!baseUrl) {
    throw new Error("Missing ReqAgent provider base URL.");
  }

  if (!apiKey) {
    throw new Error("Missing ReqAgent provider API key. Set REQAGENT_API_KEY or OPENAI_API_KEY.");
  }

  if (!model) {
    throw new Error("Missing ReqAgent provider model.");
  }

  if (!providerName) {
    throw new Error("Missing ReqAgent provider name.");
  }

  return {
    providerName,
    baseUrl,
    apiKey,
    model,
  };
}

export function getReqAgentProviderInfo(): ReqAgentProviderInfo | undefined {
  try {
    const config = getReqAgentProviderConfig();
    return {
      providerName: config.providerName,
      model: config.model,
      wireApi: "responses",
    };
  } catch {
    return undefined;
  }
}

export function logReqAgentProviderSummary() {
  if (didLogProviderSummary) {
    return;
  }

  const config = getReqAgentProviderConfig();

  let baseUrlHost = config.baseUrl;
  try {
    baseUrlHost = new URL(config.baseUrl).host;
  } catch {
    // Keep the raw baseUrl when URL parsing fails.
  }

  console.info("[reqagent] provider config", {
    providerName: config.providerName,
    baseUrlHost,
    model: config.model,
    wireApi: "responses",
  });

  didLogProviderSummary = true;
}
