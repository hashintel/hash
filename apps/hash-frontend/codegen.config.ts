import { baseGraphQlCodegenConfig } from "@local/hash-isomorphic-utils/graphql/base-codegen-config";

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema:
    "../../libs/@local/hash-isomorphic-utils/src/graphql/type-defs/**/*.ts",
  generates: {
    "./src/graphql/fragment-types.gen.json": {
      plugins: ["fragment-matcher"],
    },
    "./src/graphql/schema-types.gen.ts": {
      plugins: ["typescript"],
      config: baseGraphQlCodegenConfig,
    },
    "./src/graphql/api-types.gen.ts": {
      plugins: [
        { add: { content: 'export * from "./schema-types.gen";' } },
        "typescript-operations",
      ],
      documents: [
        "./src/graphql/queries/**/*.ts",
        "../../libs/@local/hash-isomorphic-utils/src/graphql/queries/**/*.ts",
      ],
      config: {
        ...baseGraphQlCodegenConfig,
        importSchemaTypesFrom: "./src/graphql/schema-types.gen.ts",
        // Apollo Client adds `__typename` to every selection set except the
        // root operation type.
        nonOptionalTypename: true,
        skipTypeNameForRoot: true,
      },
    },
  },
};

// eslint-disable-next-line import/no-default-export
export default config;
