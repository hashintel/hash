import type { CodegenConfig } from "@graphql-codegen/cli";
import { baseGraphQlCodegenConfig } from "@local/hash-isomorphic-utils/graphql/base-codegen-config";

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
        afterOneFileWrite: ["biome format --write --vcs-use-ignore-file=false"],
      },
      config: {
        noSchemaStitching: true,
        ...baseGraphQlCodegenConfig,
      },
    },
  },
};

export default config;
