import type { CodegenConfig } from "@graphql-codegen/cli";
import { baseGraphQlCodegenConfig } from "@local/hash-isomorphic-utils/graphql/base-codegen-config";

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
      documents: [
        "./src/graphql/queries/**/*.ts",
        "../../libs/@local/hash-isomorphic-utils/src/graphql/queries/**/*.ts",
      ],
      config: baseGraphQlCodegenConfig,
    },
  },
};

export default config;
