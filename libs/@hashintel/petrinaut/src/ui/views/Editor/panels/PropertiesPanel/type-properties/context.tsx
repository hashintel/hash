import { createContext, use } from "react";

import type { MutationContextValue } from "../../../../../../react/state/mutation-context";
import type { Color } from "@hashintel/petrinaut-core";

export interface TypePropertiesContextValue {
  type: Color;
  updateType: MutationContextValue["updateType"];
  addTypeElement: MutationContextValue["addTypeElement"];
  updateTypeElement: MutationContextValue["updateTypeElement"];
  removeTypeElement: MutationContextValue["removeTypeElement"];
  moveTypeElement: MutationContextValue["moveTypeElement"];
}

export const TypePropertiesContext =
  createContext<TypePropertiesContextValue | null>(null);

export const useTypePropertiesContext = (): TypePropertiesContextValue => {
  const context = use(TypePropertiesContext);
  if (!context) {
    throw new Error(
      "useTypePropertiesContext must be used within TypeProperties",
    );
  }
  return context;
};
