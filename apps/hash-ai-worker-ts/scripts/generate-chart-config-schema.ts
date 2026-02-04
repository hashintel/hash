/**
 * Script to generate JSON schema from ChartConfig type.
 * Used to pass to the LLM to generate the chart configuration.
 *
 * @see src/activities/flow-activities/generate-chart-config-action.ts
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
    "../../../libs/@local/hash-isomorphic-utils/src/dashboard-types.ts",
  ),
  tsconfig: path.resolve(__dirname, "../tsconfig.json"),
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
  path.join(
    __dirname,
    "..",
    "src",
    "activities",
    "flow-activities",
    "chart-config-schema.gen.ts",
  ),
  schemaContent,
);

console.log("Generated chart-config-schema.gen.ts");
