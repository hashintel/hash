import { createContext, use } from "react";

import type {
  Color,
  DifferentialEquation,
  Place,
} from "@hashintel/petrinaut-core/types/sdcpn";
import type { MutationContextValue } from "../../../../../../react/state/mutation-context";

export interface DiffEqPropertiesContextValue {
  differentialEquation: DifferentialEquation;
  types: Color[];
  places: Place[];
  updateDifferentialEquation: MutationContextValue["updateDifferentialEquation"];
}

export const DiffEqPropertiesContext =
  createContext<DiffEqPropertiesContextValue | null>(null);

export const useDiffEqPropertiesContext = (): DiffEqPropertiesContextValue => {
  const context = use(DiffEqPropertiesContext);
  if (!context) {
    throw new Error(
      "useDiffEqPropertiesContext must be used within DifferentialEquationProperties",
    );
  }
  return context;
};
