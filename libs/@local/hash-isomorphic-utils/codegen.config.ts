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
        // TODO: set `skipTypename: true` if Apollo Client stops adding
        // `__typename` at runtime.
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
        // Apollo Client adds `__typename` to every selection set except the
        // root operation type.
        // TODO: remove both options if Apollo Client stops adding `__typename`.
        nonOptionalTypename: true,
        skipTypeNameForRoot: true,
      },
    },
  },
};

export default config;
