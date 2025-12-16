/* eslint-disable no-console */
/**
 * Script to generate bundled and dereferenced JSON Schema fixtures
 * from remote HASH type schemas.
 *
 * Uses @apidevtools/json-schema-ref-parser to resolve all $ref pointers,
 * then applies post-processing for LLM compatibility.
 *
 * Output formats:
 *   - `.dereferenced.json` - Fully inlined, no $ref pointers. Larger file size
 *     but guaranteed to work with LLM structured output APIs.
 *   - `.bundled.json` - Uses $defs with $ref pointers for smaller file size.
 *     Standard JSON Schema format, but NOT YET WORKING with LLM providers.
 *
 * LLM Compatibility Note (as of Dec 2024):
 *   We have not yet found a way to make bundled schemas with $ref/$defs work
 *   with LLM structured output APIs (tested with Google AI Studio via OpenRouter).
 *   The providers appear to not properly implement JSON Schema $ref resolution.
 *   For now, use the `.dereferenced.json` files for LLM structured output.
 *   The `.bundled.json` files are kept for potential future compatibility or
 *   other use cases (standard JSON Schema validators, etc.).
 *
 * Usage:
 *   tsx apps/hash-ai-agent/src/mastra/fixtures/generate-schemas.ts
 *
 * Or via npm script:
 *   yarn workspace @apps/hash-ai-agent generate-schemas
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import $RefParser from "@apidevtools/json-schema-ref-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * List of type schema URLs to fetch and process.
 * Add new schemas here as needed.
 */
const SCHEMA_URLS = [
  "https://hash.ai/@h/types/entity-type/person/v/1",
  "https://hash.ai/@h/types/entity-type/organization/v/3",
];

/**
 * Standard JSON Schema $schema to use in output files.
 * Using 2019-09 since that's what Block Protocol meta-schemas are based on.
 */
const STANDARD_JSON_SCHEMA = "https://json-schema.org/draft/2019-09/schema";

/**
 * Extract a simple name from a type schema URL.
 * Works with entity-type, property-type, and data-type URLs.
 *
 * Examples:
 *   "https://hash.ai/@h/types/entity-type/person/v/1" -> "person"
 *   "https://hash.ai/@h/types/property-type/email/v/1" -> "email"
 *   "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" -> "text"
 */
function extractSchemaName(url: string): string {
  // URL format: .../{type-kind}/{name}/v/{version}
  // We want the segment before /v/
  const parts = url.split("/");
  const vIndex = parts.lastIndexOf("v");
  if (vIndex > 0) {
    return parts[vIndex - 1] ?? "unknown";
  }
  // Fallback: use last non-version segment
  return parts[parts.length - 3] ?? "unknown";
}

/**
 * Replace custom Block Protocol $schema declarations with standard JSON Schema.
 * This allows the output to be validated by standard JSON Schema validators.
 */
function normalizeRootSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof schema.$schema === "string") {
    return {
      ...schema,
      $schema: STANDARD_JSON_SCHEMA,
    };
  }
  return schema;
}

/**
 * Convert a $id URL to a $defs key name.
 * Creates a simple, URL-safe key that LLM providers can handle.
 *
 * Replaces problematic characters (/, @, .) with underscores to avoid
 * issues with JSON pointer parsing in LLM providers.
 *
 * Example:
 *   "https://hash.ai/@h/types/property-type/email/v/1"
 *   -> "hash_ai__h_types_property-type_email_v_1"
 */
function idToDefKey(id: string): string {
  return id
    .replace(/^https?:\/\//, "") // Remove protocol
    .replace(/[/@.]/g, "_"); // Replace /, @, . with underscores
}

/**
 * Post-Processing: Normalize to $defs structure.
 *
 * This function transforms a fully dereferenced schema into a bundled format
 * that uses a proper `$defs` section with `#/$defs/...` references.
 *
 * Why this exists:
 * - The json-schema-ref-parser `bundle()` method creates internal $ref pointers
 *   to arbitrary locations (e.g., `#/properties/...`) rather than using $defs
 * - Standard JSON Schema convention is to use `$defs` for shared definitions
 * - This function restructures the schema to follow that convention
 *
 * How it works:
 * 1. Walks the dereferenced schema to find all sub-schemas with $id properties
 * 2. Extracts them into a $defs section (keyed by their $id URL, sanitized)
 * 3. Replaces inline occurrences with $ref pointers to the $defs entries
 *
 * LLM Compatibility (as of Dec 2024):
 * Despite following standard JSON Schema conventions, the bundled output with
 * $ref/$defs does NOT work with LLM structured output APIs tested so far
 * (Google AI Studio). The providers appear to not properly resolve $ref pointers.
 * Use the dereferenced output for LLM structured output until this is resolved.
 */
function normalizeToDefsStructure(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const defs: Record<string, Record<string, unknown>> = {};
  const rootId = schema.$id as string | undefined;

  /**
   * Recursively walk the schema and collect all sub-schemas with $id.
   * Returns a new object with sub-schemas replaced by $ref pointers.
   */
  function processNode(node: unknown, isRoot = false): unknown {
    if (node === null || typeof node !== "object") {
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((item) => processNode(item));
    }

    const obj = node as Record<string, unknown>;
    const nodeId = obj.$id as string | undefined;

    // If this node has a $id and it's not the root schema,
    // extract it to $defs and return a $ref pointer
    if (nodeId && !isRoot && nodeId !== rootId) {
      const defKey = idToDefKey(nodeId);

      // Only add to defs if we haven't seen it before
      if (!defs[defKey]) {
        // Process children first (without marking as root)
        const processedNode: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          processedNode[key] = processNode(value);
        }
        defs[defKey] = processedNode;
      }

      // Return a $ref pointer instead of the inline schema
      return { $ref: `#/$defs/${defKey}` };
    }

    // Process children
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = processNode(value);
    }
    return result;
  }

  // Process the schema starting from root
  const processed = processNode(schema, true) as Record<string, unknown>;

  // Add $defs if we collected any, placing it after $schema and $id
  if (Object.keys(defs).length > 0) {
    const { $schema, $id, ...rest } = processed;
    return {
      ...($schema !== undefined && { $schema }),
      ...($id !== undefined && { $id }),
      $defs: defs,
      ...rest,
    };
  }

  return processed;
}

async function generateSchemas() {
  const outputDir = path.join(__dirname, "entity-schemas");

  console.log("Generating type schema fixtures...\n");

  for (const url of SCHEMA_URLS) {
    const name = extractSchemaName(url);
    console.log(`Processing: ${name} (${url})`);

    try {
      // First, fully dereference the schema (resolves all $refs inline)
      const dereferenced = await $RefParser.dereference(url);

      // Generate dereferenced version (no $refs at all)
      // Largest file size but guaranteed LLM compatibility
      // USE THIS FOR LLM STRUCTURED OUTPUT
      const normalizedDereferenced = normalizeRootSchema(
        dereferenced as Record<string, unknown>,
      );
      const dereferencedPath = path.join(
        outputDir,
        `${name}.dereferenced.json`,
      );
      await writeFile(
        dereferencedPath,
        JSON.stringify(normalizedDereferenced, null, 2),
      );
      console.log(`  -> ${name}.dereferenced.json`);

      // Generate bundled version with proper $defs structure
      // Smaller file size, uses standard JSON Schema $ref/$defs format
      // NOTE: NOT YET WORKING with LLM providers - kept for future compatibility
      const bundled = normalizeToDefsStructure(
        dereferenced as Record<string, unknown>,
      );
      const normalizedBundled = normalizeRootSchema(bundled);
      const bundledPath = path.join(outputDir, `${name}.bundled.json`);
      await writeFile(bundledPath, JSON.stringify(normalizedBundled, null, 2));
      console.log(`  -> ${name}.bundled.json`);
    } catch (error) {
      console.error(`  Error processing ${name}:`, error);
      process.exitCode = 1;
    }
  }

  console.log("\nDone!");
}

await generateSchemas();
