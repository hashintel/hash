import { createContext, use } from "react";

import type { PetrinautMutations } from "../../../../../../react";
import type { Parameter } from "@hashintel/petrinaut-core";

export interface ParameterPropertiesContextValue {
  parameter: Parameter;
  updateParameter: PetrinautMutations["updateParameter"];
}

export const ParameterPropertiesContext =
  createContext<ParameterPropertiesContextValue | null>(null);

export const useParameterPropertiesContext =
  (): ParameterPropertiesContextValue => {
    const context = use(ParameterPropertiesContext);
    if (!context) {
      throw new Error(
        "useParameterPropertiesContext must be used within ParameterProperties",
      );
    }
    return context;
  };
