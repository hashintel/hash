import { createContext, use } from "react";

import type {
  Color,
  DifferentialEquation,
  Place,
} from "../../../../../core/types/sdcpn";

export interface DiffEqPropertiesContextValue {
  differentialEquation: DifferentialEquation;
  types: Color[];
  places: Place[];
  updateDifferentialEquation: (
    equationId: string,
    updateFn: (equation: DifferentialEquation) => void,
  ) => void;
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
