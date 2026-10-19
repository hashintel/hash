import { scalars } from "./scalar-mapping.js";

import type { TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import type { TypeScriptDocumentsPluginConfig } from "@graphql-codegen/typescript-operations";

/**
 * Config for the `typescript` plugin, which generates the schema types into
 * `schema-types.gen.ts`.
 */
export const baseSchemaTypesCodegenConfig: TypeScriptPluginConfig = {
  avoidOptionals: {
    defaultValue: true,
  },
  skipTypename: false,
  scalars,
};

/**
 * Config for the `typescript-operations` plugin, which generates the operation
 * types into `api-types.gen.ts` and imports the schema types it references
 * from the file set in `importSchemaTypesFrom`.
 */
export const baseGraphQlCodegenConfig: TypeScriptDocumentsPluginConfig = {
  arrayInputCoercion: false,
  avoidOptionals: {
    defaultValue: true,
  },
  scalars,
};
