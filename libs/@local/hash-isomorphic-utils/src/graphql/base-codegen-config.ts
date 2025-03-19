import type { TypeScriptDocumentsPluginConfig } from "@graphql-codegen/typescript-operations";

import { scalars } from "./scalar-mapping.js";

export const baseGraphQlCodegenConfig: TypeScriptDocumentsPluginConfig = {
  arrayInputCoercion: false,
  avoidOptionals: {
    defaultValue: true,
  },
  skipTypename: true,
  scalars,
};
