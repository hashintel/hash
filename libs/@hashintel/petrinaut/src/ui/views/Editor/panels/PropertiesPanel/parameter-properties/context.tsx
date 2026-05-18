import { createContext, use } from "react";

import type { Parameter } from "@hashintel/petrinaut-core/types/sdcpn";
import type { MutationContextValue } from "../../../../../../react/state/mutation-context";

export interface ParameterPropertiesContextValue {
  parameter: Parameter;
  updateParameter: MutationContextValue["updateParameter"];
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
