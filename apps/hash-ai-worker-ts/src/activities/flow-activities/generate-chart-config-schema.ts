/**
 * Script to generate JSON schema from ChartConfig type.
 * Run with: yarn generate:chart-config-schema (from apps/hash-ai-worker-ts)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as generator from "ts-json-schema-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  path: path.resolve(
    __dirname,
    "../../../../libs/@local/hash-isomorphic-utils/src/dashboard-types.ts",
  ),
  tsconfig: path.resolve(__dirname, "../../../tsconfig.json"),
  type: "ChartConfig",
} satisfies generator.Config;

const schema = generator.createGenerator(config).createSchema("ChartConfig");

const schemaContent = `/**
 * Auto-generated JSON schema for ChartConfig.
 * Do not edit manually - regenerate with: yarn generate:chart-config-schema
 */
export const chartConfigSchema = ${JSON.stringify(schema, null, 2)} as const;
`;

writeFileSync(
  path.resolve(__dirname, "chart-config-schema.gen.ts"),
  schemaContent,
);

// eslint-disable-next-line no-console
console.log("Generated chart-config-schema.gen.ts");
