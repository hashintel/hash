import { baseGraphQlCodegenConfig } from "@local/hash-isomorphic-utils/graphql/base-codegen-config";

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema:
    "../../libs/@local/hash-isomorphic-utils/src/graphql/type-defs/**/*.ts",
  generates: {
    "./src/graphql/graphql-schema.gen.json": {
      plugins: ["introspection"],
      config: {
        noSchemaStitching: true,
      },
    },
    "./src/graphql/api-types.gen.ts": {
      plugins: ["typescript", "typescript-resolvers", "typescript-operations"],
      documents: [
        "../../libs/@local/hash-isomorphic-utils/src/graphql/queries/**/*.ts",
      ],
      hooks: {
        afterOneFileWrite: ["oxfmt --write --ignore-path /dev/null"],
      },
      config: {
        noSchemaStitching: true,
        ...baseGraphQlCodegenConfig,
      },
    },
  },
};

export default config;
