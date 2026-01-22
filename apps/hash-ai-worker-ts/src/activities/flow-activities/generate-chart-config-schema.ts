/**
 * Script to generate JSON schema from ChartConfig type.
 * Run with: npx tsx generate-chart-config-schema.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as generator from "ts-json-schema-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config: generator.Config = {
  diagnostics: false,
  noTopRef: true,
  path: path.resolve(
    __dirname,
    "../../../../libs/@local/hash-isomorphic-utils/src/dashboard-types.ts",
  ),
  skipTypeCheck: true,
  tsconfig: path.resolve(__dirname, "../../../tsconfig.json"),
  type: "ChartConfig",
};

const schema = generator.createGenerator(config).createSchema("ChartConfig");

// Write the schema to a JSON file
writeFileSync(
  path.resolve(__dirname, "chart-config-schema.gen.json"),
  JSON.stringify(schema, null, 2),
);

// eslint-disable-next-line no-console
console.log("Generated chart-config-schema.gen.json");

// Also export the schema as a constant for direct import
const schemaContent = `/**
 * Auto-generated JSON schema for ChartConfig.
 * Do not edit manually - run: npx tsx generate-chart-config-schema.ts
 */
export const chartConfigSchema = ${JSON.stringify(schema, null, 2)} as const;
`;

writeFileSync(
  path.resolve(__dirname, "chart-config-schema.gen.ts"),
  schemaContent,
);

// eslint-disable-next-line no-console
console.log("Generated chart-config-schema.gen.ts");
