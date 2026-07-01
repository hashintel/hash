import { createContext } from "react";

import type {
  Color,
  ComponentInstance,
  DifferentialEquation,
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
};

export type ActiveNetContextValue = {
  activeNet: ActiveNetDefinition;
  activeSubnetId: string | null;
  setActiveSubnetId: (subnetId: string | null) => void;
};

const DEFAULT_ACTIVE_NET: ActiveNetDefinition = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [],
};

export const ActiveNetContext = createContext<ActiveNetContextValue>({
  activeNet: DEFAULT_ACTIVE_NET,
  activeSubnetId: null,
  setActiveSubnetId: () => {},
});
