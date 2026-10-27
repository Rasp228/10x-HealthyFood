// Renders the review schema's field descriptions (the rubrics) as prompt text.
// llama-server turns the JSON schema into a sampling grammar only, so the descriptions never
// reach a local model; this appends them to the instructions. Generated from REVIEW_JSON_SCHEMA,
// so review-schema.ts stays the single source of the rubrics.
import { REVIEW_JSON_SCHEMA } from "../review-schema.js";

type JsonSchema = typeof REVIEW_JSON_SCHEMA;
type JsonSchemaProperty = NonNullable<JsonSchema["properties"]>[string];

function describeType(property: Exclude<JsonSchemaProperty, boolean>): string {
  if (property.enum) return property.enum.map((value) => JSON.stringify(value)).join(" | ");
  return Array.isArray(property.type) ? property.type.join(" | ") : (property.type ?? "any");
}

export function renderSchemaFields(schema: JsonSchema = REVIEW_JSON_SCHEMA): string {
  const required = new Set(schema.required ?? []);
  const lines = Object.entries(schema.properties ?? {}).map(([name, property]) => {
    if (typeof property === "boolean") return `- ${name}`;
    const optional = required.has(name) ? "" : ", opcjonalne";
    const description = property.description ? `: ${property.description}` : "";
    return `- ${name} (${describeType(property)}${optional})${description}`;
  });
  return `Odpowiedz wyłącznie obiektem JSON z polami:\n${lines.join("\n")}`;
}
