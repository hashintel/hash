/**
 * Converts dereferenced JSON schemas to a concise, LLM-friendly YAML-like summary.
 *
 * This utility generates a human-readable summary of entity type schemas for use
 * in LLM prompts. It extracts the essential information (type name, description,
 * and property definitions) while preserving the full URL property keys that match
 * the structured output schema.
 *
 * Example output:
 * ```
 * Entity Types:
 * - Person: A human being
 *   properties:
 *     https://blockprotocol.org/@blockprotocol/types/property-type/name/: A word or set of words...
 *     https://blockprotocol.org/@blockprotocol/types/property-type/description/: A piece of text...
 * ```
 */

type JsonSchemaProperty = {
  $id?: string;
  title?: string;
  description?: string;
  oneOf?: unknown[];
  items?: JsonSchemaProperty;
  type?: string;
};

type JsonSchema = {
  $id?: string;
  title?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  type?: string;
};

/**
 * Extract a human-readable description from a property schema.
 * Falls back through: description -> title -> "(no description)"
 */
function getPropertyDescription(property: JsonSchemaProperty): string {
  // Direct description
  if (property.description) {
    return property.description;
  }

  // Fall back to title
  if (property.title) {
    return property.title;
  }

  // For array types, try to get description from items
  if (property.type === "array" && property.items) {
    return getPropertyDescription(property.items);
  }

  return "(no description)";
}

/**
 * Convert a single schema to YAML-like summary lines.
 */
function schemaToLines(schema: JsonSchema): string[] {
  const lines: string[] = [];

  const title = schema.title ?? "Unknown";
  const description = schema.description ?? "";

  lines.push(`- ${title}: ${description}`);

  if (schema.properties) {
    lines.push("  properties:");

    for (const [key, property] of Object.entries(schema.properties)) {
      const propDescription = getPropertyDescription(property);
      lines.push(`    ${key}: ${propDescription}`);
    }
  }

  return lines;
}

/**
 * Converts dereferenced JSON schema(s) to a concise, LLM-friendly YAML-like summary.
 *
 * Use this in LLM prompts to provide context about the entity types being extracted,
 * with property keys matching the structured output schema exactly.
 *
 * @param schemas - A single schema or array of schemas (dereferenced JSON format)
 * @returns A YAML-like string summarizing the entity types and their properties
 *
 * @example
 * ```typescript
 * import personSchema from '../fixtures/entity-schemas/person.dereferenced.json';
 * import orgSchema from '../fixtures/entity-schemas/organization.dereferenced.json';
 *
 * const summary = schemaToPromptSummary([personSchema, orgSchema]);
 * // Use in prompt:
 * // `Extract entities matching these types:\n${summary}`
 * ```
 */
export function schemaToPromptSummary(
  schemas: JsonSchema | JsonSchema[],
): string {
  const schemaArray = Array.isArray(schemas) ? schemas : [schemas];

  if (schemaArray.length === 0) {
    return "";
  }

  const lines: string[] = ["Entity Types:"];

  for (const schema of schemaArray) {
    lines.push(...schemaToLines(schema));
  }

  return lines.join("\n");
}
