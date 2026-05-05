import { createContext, use } from "react";

import type { Parameter } from "../../../../../core/types/sdcpn";

export interface ParameterPropertiesContextValue {
  parameter: Parameter;
  updateParameter: (
    parameterId: string,
    updateFn: (parameter: Parameter) => void,
  ) => void;
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
