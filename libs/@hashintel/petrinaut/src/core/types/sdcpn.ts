export type ID = string;

export type Transition = {
  id: ID;
  name: string;
  inputArcs: { placeId: string; weight: number }[];
  outputArcs: { placeId: string; weight: number }[];
  lambdaCode: string;
  transitionKernelCode: string;
};

export type Place = {
  id: ID;
  name: string;
  dimensions: number;
  differentialEquationCode: string;
};

export type SDCPN = {
  id: ID;
  title: string;
  places: Place[];
  transitions: Transition[];
};
