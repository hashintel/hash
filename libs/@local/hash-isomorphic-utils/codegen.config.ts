import { CodegenConfig } from "@graphql-codegen/cli";
import { scalars } from "@local/hash-isomorphic-utils/scalar-mapping";

const config: CodegenConfig = {
  overwrite: true,
  schema: "../hash-graphql-shared/src/graphql/type-defs/**/*.ts",
  generates: {
    "./src/graphql/fragment-types.gen.json": {
      plugins: ["fragment-matcher"],
    },
    "./src/graphql/api-types.gen.ts": {
      plugins: ["typescript", "typescript-operations"],
      documents: ["../hash-graphql-shared/src/queries/**/*.ts"],
      config: {
        skipTypename: true,
        // Use shared scalars
        scalars,
      },
    },
  },
};

export default config;
