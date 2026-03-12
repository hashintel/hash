type ID = string;

type Transition = {
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

type Place = {
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

type SDCPNType = {
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

type Parameter = {
  id: ID;
  name: string;
  variableName: string;
  type: "real" | "integer" | "boolean";
  defaultValue: string;
};

type DifferentialEquation = {
  id: ID;
  name: string;
  typeId: ID; // refers to types.id
  code: string;
};

export type Pre20251128SDCPN = {
  id: ID;
  title: string;
  places: Place[];
  transitions: Transition[];
  types: SDCPNType[];
  differentialEquations: DifferentialEquation[];
  parameters: Parameter[];
};
