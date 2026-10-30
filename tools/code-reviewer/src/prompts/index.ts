// The one place that assembles the text the model sees: provider-dependent instructions
// and the user prompt carrying the PR title, the PR description and the diff.
import type { ProviderName } from "../provider.js";
import { renderSchemaFields } from "./schema-fields.js";
import { SYSTEM_PROMPT } from "./system-prompt.js";

export { renderSchemaFields, SYSTEM_PROMPT };

// Optional PR context next to the diff; an empty or whitespace-only field is treated as absent.
export interface PrContext {
  title?: string;
  body?: string;
}

// Cap on the PR description, in UTF-8 bytes. It is separate from REVIEW_MAX_DIFF_BYTES: the
// description is cut, not rejected, because it only explains intent and is never reviewed itself.
export const MAX_PR_BODY_BYTES = 4000;

const FENCE_TAGS = ["pr_title", "pr_description", "diff"] as const;

// llama-server uses the schema only as a grammar, so the rubrics in the field descriptions
// are spelled out in the instructions; providers with native structured output read them there.
export function buildInstructions(provider: ProviderName): string {
  return provider === "local" ? `${SYSTEM_PROMPT}\n\n${renderSchemaFields()}` : SYSTEM_PROMPT;
}

function escapeClosingTag(text: string, tag: string): string {
  return text.replace(new RegExp(`</${tag}>`, "gi"), `<\\/${tag}>`);
}

// The title and the description are written by the PR author too, so every fence tag is escaped
// in them, not only their own: none of them can close a fence or fake the start of the next one.
function escapeAllClosingTags(text: string): string {
  return FENCE_TAGS.reduce(escapeClosingTag, text);
}

// Cuts at a character boundary: a byte count can land inside a multibyte character (Polish
// letters are two bytes), and decoding the cut half would leave a U+FFFD in the prompt.
export function truncatePrBody(body: string, maxBytes = MAX_PR_BODY_BYTES): string {
  const bytes = Buffer.from(body, "utf8");
  if (bytes.length <= maxBytes) return body;
  let end = maxBytes;
  // 0b10xxxxxx is a continuation byte: the character it belongs to started before `end`.
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  const kept = bytes.subarray(0, end).toString("utf8");
  return `${kept}\n\n[opis przycięty do ${maxBytes} bajtów]`;
}

function section(label: string, tag: string, text: string | undefined): string {
  if (!text?.trim()) return "";
  return `${label}:\n\n<${tag}>\n${escapeAllClosingTags(text)}\n</${tag}>\n\n`;
}

// The diff is untrusted: fenced in <diff> tags, with any closing tag inside it escaped so the
// author cannot end the fence early and write text that reads as ours. The PR title and
// description get their own fences before it. Without context the prompt is the diff part alone.
export function buildReviewPrompt(diff: string, context: PrContext = {}): string {
  const title = section("Tytuł PR-a", "pr_title", context.title);
  const body = context.body?.trim() ? truncatePrBody(context.body) : undefined;
  const description = section("Opis PR-a", "pr_description", body);
  const fenced = escapeClosingTag(diff, "diff");
  return `${title}${description}Oto diff do recenzji:\n\n<diff>\n${fenced}\n</diff>`;
}
