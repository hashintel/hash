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
  type: null | ID; // refers to types.id
  dynamicsEnabled: boolean;
  differentialEquationCode: null | {
    refId: ID; // refers to differentialEquations.id
  };
  visualizerCode?: string;
  // UI positioning
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export type SDCPNType = {
  id: ID;
  name: string;
  iconId: string; // e.g., "circle", "square"
  colorCode: string; // e.g., "#FF0000"
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
  id: ID;
  title: string;
  places: Place[];
  transitions: Transition[];
  types: SDCPNType[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
};
