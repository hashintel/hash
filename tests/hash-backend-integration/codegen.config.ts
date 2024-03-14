import type { CodegenConfig } from "@graphql-codegen/cli";
import { scalars } from "@local/hash-isomorphic-utils/graphql/scalar-mapping";

const config: CodegenConfig = {
  overwrite: true,
  schema:
    "../../libs/@local/hash-isomorphic-utils/src/graphql/type-defs/**/*.ts",
  generates: {
    "./src/graphql/fragment-types.gen.json": {
      plugins: ["fragment-matcher"],
    },
    "./src/graphql/api-types.gen.ts": {
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
