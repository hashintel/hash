import { CodegenConfig } from "@graphql-codegen/cli";
import { scalars } from "@local/hash-graphql-shared/graphql/scalar-mapping";

const config: CodegenConfig = {
  overwrite: true,
  schema: "./src/graphql/type-defs/**/*.ts",
  generates: {
    "./src/graphql/fragment-types.gen.json": {
      plugins: ["fragment-matcher"],
    },
    "./src/graphql/api-types.gen.ts": {
      plugins: ["typescript", "typescript-operations"],
      documents: ["./src/queries/*.ts"],
      config: {
        skipTypename: true,
        // Use shared scalars
        scalars,
      },
    },
  },
};

export default config;
