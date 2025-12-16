/* eslint-disable no-console */
/**
 * Script to generate bundled and dereferenced JSON Schema fixtures
 * from remote HASH type schemas.
 *
 * Uses @apidevtools/json-schema-ref-parser to resolve all $ref pointers.
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
function normalizeSchema(
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

async function generateSchemas() {
  const outputDir = path.join(__dirname, "entity-schemas");

  console.log("Generating type schema fixtures...\n");

  for (const url of SCHEMA_URLS) {
    const name = extractSchemaName(url);
    console.log(`Processing: ${name} (${url})`);

    try {
      // Generate bundled version
      // All external $refs are resolved and converted to internal references
      // Safe for JSON.stringify (no circular refs)
      const bundled = await $RefParser.bundle(url);
      const normalizedBundled = normalizeSchema(
        bundled as Record<string, unknown>,
      );
      const bundledPath = path.join(outputDir, `${name}.bundled.json`);
      await writeFile(bundledPath, JSON.stringify(normalizedBundled, null, 2));
      console.log(`  -> ${name}.bundled.json`);

      // Generate dereferenced version
      // All $refs are fully resolved inline (no $refs remain)
      // Note: May contain circular references if the schema has them
      const dereferenced = await $RefParser.dereference(url);
      const normalizedDereferenced = normalizeSchema(
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
    } catch (error) {
      console.error(`  Error processing ${name}:`, error);
      process.exitCode = 1;
    }
  }

  console.log("\nDone!");
}

await generateSchemas();
