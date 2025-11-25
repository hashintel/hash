export type ID = string;

export type Transition = {
  id: ID;
  name: string;
  inputArcs: { placeId: string; weight: number }[];
  outputArcs: { placeId: string; weight: number }[];
  lambdaType: "predicate" | "stochastic";
  lambdaCode: string;
  transitionKernelCode: string;
  // UI positioning
  x: number;
  y: number;
  width?: number;
  height?: number;
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
  width?: number;
  height?: number;
};

export type Color = {
  id: ID;
  name: string;
  iconSlug: string; // e.g., "circle", "square"
  displayColor: string; // e.g., "#FF0000"
  elements: {
    id: string;
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
  typeId: ID; // refers to types.id
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
};

export type MutateSDCPN = (mutateFn: (sdcpn: SDCPN) => void) => void;
