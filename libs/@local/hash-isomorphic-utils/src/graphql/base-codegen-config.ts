import { scalars } from "./scalar-mapping.js";

import type { TypeScriptPluginConfig } from "@graphql-codegen/typescript";
import type { TypeScriptDocumentsPluginConfig } from "@graphql-codegen/typescript-operations";

export const baseGraphQlCodegenConfig: TypeScriptPluginConfig &
  TypeScriptDocumentsPluginConfig = {
  arrayInputCoercion: false,
  avoidOptionals: {
    defaultValue: true,
  },
  skipTypename: false,
  scalars,
};
