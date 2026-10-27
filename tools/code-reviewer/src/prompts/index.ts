// The one place that assembles the text the model sees: provider-dependent instructions
// and the user prompt carrying the diff.
import type { ProviderName } from "../provider.js";
import { renderSchemaFields } from "./schema-fields.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

export { renderSchemaFields, SYSTEM_PROMPT };

// llama-server uses the schema only as a grammar, so the rubrics in the field descriptions
// are spelled out in the instructions; providers with native structured output read them there.
export function buildInstructions(provider: ProviderName): string {
  return provider === "local" ? `${SYSTEM_PROMPT}\n\n${renderSchemaFields()}` : SYSTEM_PROMPT;
}

export function buildReviewPrompt(diff: string): string {
  return `Oto diff do recenzji:\n\n${diff}`;
}
