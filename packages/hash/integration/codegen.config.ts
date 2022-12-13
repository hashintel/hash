import { CodegenConfig } from "@graphql-codegen/cli";
import { scalars } from "@hashintel/hash-shared/graphql/scalar-mapping";

const config: CodegenConfig = {
  overwrite: true,
  schema: "../api/src/graphql/typeDefs/**/*.ts",
  generates: {
    "./src/graphql/fragmentTypes.gen.json": {
      plugins: ["fragment-matcher"],
    },
    "./src/graphql/apiTypes.gen.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        skipTypename: true,
        // Use shared scalars
        scalars,
      },
    },
  },
};
export default config;
