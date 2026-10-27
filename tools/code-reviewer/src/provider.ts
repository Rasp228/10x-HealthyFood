// Model selection: REVIEW_PROVIDER picks the backend, REVIEW_MODEL the model id.
// Kept apart from the review flow so the ToolLoopAgent refactor reuses it as-is.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

export const PROVIDERS = ["local", "openrouter"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

const DEFAULT_PROVIDER: ProviderName = "local";
const DEFAULT_LLAMACPP_BASE_URL = "http://localhost:8080/v1";
const DEFAULT_MODELS: Record<ProviderName, string> = {
  // llama-server answers with whatever model it was started with; the id is only a label.
  local: "local",
  openrouter: "anthropic/claude-sonnet-5.5",
};

export interface ReviewModel {
  provider: ProviderName;
  modelId: string;
  model: LanguageModel;
}

function readProvider(env: NodeJS.ProcessEnv): ProviderName {
  const raw = env.REVIEW_PROVIDER || DEFAULT_PROVIDER;
  if (!(PROVIDERS as readonly string[]).includes(raw)) {
    throw new Error(`REVIEW_PROVIDER must be one of ${PROVIDERS.join("|")}, got "${raw}"`);
  }
  return raw as ProviderName;
}

// Throws before any request is made, so a misconfigured run fails fast.
export function selectModel(env: NodeJS.ProcessEnv = process.env): ReviewModel {
  const provider = readProvider(env);
  const modelId = env.REVIEW_MODEL || DEFAULT_MODELS[provider];

  if (provider === "openrouter") {
    const apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set but REVIEW_PROVIDER=openrouter (see tools/code-reviewer/.env.example)"
      );
    }
    // usage.include makes OpenRouter report the billed cost in providerMetadata.openrouter.usage.cost.
    const model = createOpenRouter({ apiKey })(modelId, { usage: { include: true } });
    return { provider, modelId, model };
  }

  const llamacpp = createOpenAICompatible({
    name: "llamacpp",
    baseURL: env.LLAMACPP_BASE_URL || DEFAULT_LLAMACPP_BASE_URL,
    supportsStructuredOutputs: true,
  });
  return { provider, modelId, model: llamacpp(modelId) };
}
