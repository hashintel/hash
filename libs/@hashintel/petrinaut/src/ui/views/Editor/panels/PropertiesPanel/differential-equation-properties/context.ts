import { requiredContext } from "../../../../../../react/required-context";

import type {
  Color,
  DifferentialEquation,
  Place,
} from "@hashintel/petrinaut-core";

export const [DiffEqPropertiesContext, useDiffEqPropertiesContext] =
  requiredContext<{
    differentialEquation: DifferentialEquation;
    types: Color[];
    places: Place[];
  }>("DifferentialEquationProperties");
