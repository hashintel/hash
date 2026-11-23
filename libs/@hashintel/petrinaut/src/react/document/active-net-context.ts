import { createContext } from "react";

import type {
  Color,
  ComponentInstance,
  DifferentialEquation,
  Fusion,
  Parameter,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";

export type ActiveNetDefinition = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  componentInstances: ComponentInstance[];
  fusions: Fusion[];
};

type ActiveNetContextValue = {
  activeNet: ActiveNetDefinition;
  activeComponentId: string | null;
  setActiveComponentId: (componentId: string | null) => void;
};

const DEFAULT_ACTIVE_NET: ActiveNetDefinition = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
  fusions: [],
};

export const ActiveNetContext = createContext<ActiveNetContextValue>({
  activeNet: DEFAULT_ACTIVE_NET,
  activeComponentId: null,
  setActiveComponentId: () => {},
});
