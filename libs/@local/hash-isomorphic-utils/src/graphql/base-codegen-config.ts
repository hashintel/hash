import { scalars } from "./scalar-mapping.js";

import type { TypeScriptDocumentsPluginConfig } from "@graphql-codegen/typescript-operations";

export const baseGraphQlCodegenConfig: TypeScriptDocumentsPluginConfig = {
  arrayInputCoercion: false,
  avoidOptionals: {
    defaultValue: true,
  },
  skipTypename: true,
  scalars,
};
