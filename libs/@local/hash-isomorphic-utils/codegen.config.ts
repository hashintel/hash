import { _localRelativeScalars } from "./src/graphql/scalar-mapping.js";

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema: "./src/graphql/type-defs/**/*.ts",
  generates: {
    "./src/graphql/fragment-types.gen.json": {
      plugins: ["fragment-matcher"],
    },
    "./src/graphql/schema-types.gen.ts": {
      plugins: ["typescript"],
      config: {
        // Apollo Client adds `__typename` to every object in a response except
        // the root operation type, so the generated types include it.
        skipTypename: false,
        // Use shared scalars
        scalars: _localRelativeScalars,
      },
    },
    "./src/graphql/api-types.gen.ts": {
      plugins: [
        { add: { content: 'export * from "./schema-types.gen.js";' } },
        "typescript-operations",
      ],
      documents: ["./src/graphql/queries/**/*.ts"],
      config: {
        // Use shared scalars
        scalars: _localRelativeScalars,
        importSchemaTypesFrom: "./src/graphql/schema-types.gen.ts",
        importExtension: ".js",
        // Match the `__typename` Apollo Client adds; see `skipTypename` above.
        nonOptionalTypename: true,
        skipTypeNameForRoot: true,
      },
    },
  },
};

export default config;
