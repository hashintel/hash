import { CodegenConfig } from "@graphql-codegen/cli";
import { scalars } from "@local/hash-isomorphic-utils/graphql/scalar-mapping";

const config: CodegenConfig = {
  overwrite: true,
  schema:
    "../../libs/@local/hash-isomorphic-utils/src/graphql/type-defs/**/*.ts",
  require: ["ts-node/register"],
  generates: {
    "./src/graphql/api-types.gen.ts": {
      plugins: ["typescript"],
      hooks: {
        afterOneFileWrite: ["prettier --write"],
      },
      config: {
        avoidOptionals: {
          defaultValue: true,
        },
        noSchemaStitching: true,
        skipTypename: true,
        scalars,
      },
    },
  },
};

export default config;
