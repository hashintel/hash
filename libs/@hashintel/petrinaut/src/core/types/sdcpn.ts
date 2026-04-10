export type ID = string;

export type InputArc = {
  placeId: string;
  weight: number;
  type: "standard" | "inhibitor";
};

export type OutputArc = {
  placeId: string;
  weight: number;
};

export type Transition = {
  id: ID;
  name: string;
  inputArcs: InputArc[];
  outputArcs: OutputArc[];
  lambdaType: "predicate" | "stochastic";
  lambdaCode: string;
  transitionKernelCode: string;
  // UI positioning
  x: number;
  y: number;
};

export type Place = {
  id: ID;
  name: string;
  colorId: null | ID;
  dynamicsEnabled: boolean;
  differentialEquationId: null | ID;
  visualizerCode?: string;
  // UI positioning
  x: number;
  y: number;
};

export type Color = {
  id: ID;
  name: string;
  iconSlug: string; // e.g., "circle", "square"
  displayColor: string; // e.g., "#FF0000"
  elements: {
    elementId: string;
    name: string;
    type: "real" | "integer" | "boolean";
  }[];
};

export type Parameter = {
  id: ID;
  name: string;
  variableName: string;
  type: "real" | "integer" | "boolean";
  defaultValue: string;
};

export type DifferentialEquation = {
  id: ID;
  name: string;
  colorId: ID;
  code: string;
};

export type SDCPN = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
};

export type MinimalNetMetadata = {
  netId: string;
  title: string;
  lastUpdated: string;
};

export type MutateSDCPN = (mutateFn: (sdcpn: SDCPN) => void) => void;
