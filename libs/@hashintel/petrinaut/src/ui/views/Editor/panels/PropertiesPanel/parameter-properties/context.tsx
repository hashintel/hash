import { createContext, use } from "react";

import type { MutationContextValue } from "../../../../../../react/state/mutation-context";
import type { Parameter } from "@hashintel/petrinaut-core";

export interface ParameterPropertiesContextValue {
  parameter: Parameter;
  updateParameter: MutationContextValue["updateParameter"];
}

export const ParameterPropertiesContext = createContext<ParameterPropertiesContextValue | null>(
  null,
);

export const useParameterPropertiesContext = (): ParameterPropertiesContextValue => {
  const context = use(ParameterPropertiesContext);
  if (!context) {
    throw new Error("useParameterPropertiesContext must be used within ParameterProperties");
  }
  return context;
};
