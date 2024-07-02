import type { CodegenConfig } from "@graphql-codegen/cli";
import { scalars } from "@local/hash-isomorphic-utils/graphql/scalar-mapping";

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
        afterOneFileWrite: ["prettier --write"],
      },
      config: {
        avoidOptionals: {
          defaultValue: true,
        },
        noSchemaStitching: true,
        skipTypename: true,
        // Use shared scalars
        scalars,
      },
    },
  },
};

export default config;
