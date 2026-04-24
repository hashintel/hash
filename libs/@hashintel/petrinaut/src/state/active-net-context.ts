import { createContext } from "react";

import type {
  Color,
  DifferentialEquation,
  ComponentInstance,
  Parameter,
  Place,
  Transition,
} from "../core/types/sdcpn";

/**
 * The shape of the currently active net (root or a selected subnet).
 * This is the subset of SDCPN fields that vary depending on which net is viewed.
 */
export type ActiveNetDefinition = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
  componentInstances: ComponentInstance[];
};

export type ActiveNetContextValue = {
  /** The currently viewed net's definition (root or subnet). */
  activeNet: ActiveNetDefinition;
  /** The ID of the active subnet, or null when viewing the root net. */
  activeSubnetId: string | null;
  /** Switch the active view to a subnet (by ID) or back to root (null). */
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

const DEFAULT_CONTEXT_VALUE: ActiveNetContextValue = {
  activeNet: DEFAULT_ACTIVE_NET,
  activeSubnetId: null,
  setActiveSubnetId: () => {},
};

export const ActiveNetContext = createContext<ActiveNetContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
