import type { CodegenConfig } from "@graphql-codegen/cli";

import { _localRelativeScalars } from "./src/graphql/scalar-mapping.js";

const config: CodegenConfig = {
  overwrite: true,
  schema: "./src/graphql/type-defs/**/*.ts",
  generates: {
    "./src/graphql/fragment-types.gen.json": {
      plugins: ["fragment-matcher"],
    },
    "./src/graphql/api-types.gen.ts": {
      plugins: ["typescript", "typescript-operations"],
      documents: ["./src/graphql/queries/**/*.ts"],
      config: {
        skipTypename: true,
        // Use shared scalars
        scalars: _localRelativeScalars,
      },
    },
  },
};

export default config;
