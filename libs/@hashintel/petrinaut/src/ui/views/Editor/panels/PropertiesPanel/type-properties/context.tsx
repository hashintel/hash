import { createContext, use } from "react";

import type { PetrinautMutations } from "../../../../../../react";
import type { Color } from "@hashintel/petrinaut-core";

export interface TypePropertiesContextValue {
  type: Color;
  updateType: PetrinautMutations["updateType"];
  addTypeElement: PetrinautMutations["addTypeElement"];
  updateTypeElement: PetrinautMutations["updateTypeElement"];
  removeTypeElement: PetrinautMutations["removeTypeElement"];
  moveTypeElement: PetrinautMutations["moveTypeElement"];
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
