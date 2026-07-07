import { createContext, use } from "react";

import type { PetrinautMutations } from "../../../../../../react";
import type {
  Color,
  DifferentialEquation,
  Place,
} from "@hashintel/petrinaut-core";

export interface DiffEqPropertiesContextValue {
  differentialEquation: DifferentialEquation;
  types: Color[];
  places: Place[];
  updateDifferentialEquation: PetrinautMutations["updateDifferentialEquation"];
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
