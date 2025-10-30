export type ID = string;

export type DifferentialEquationFn = (
  placeValues: Float64Array,
  t: number
) => Float64Array;

export type LambdaFn = (tokenValues: number[][][]) => number;

export type TransitionKernelFn = (tokenValues: number[][][]) => number[][][];

export type Transition = {
  id: string;
  name: string;
  inputArcs: { placeId: string; weight: number }[];
  outputArcs: { placeId: string; weight: number }[];
  lambdaCode: string;
  transitionKernelCode: string;
};

export type Place = {
  id: string;
  name: string;
  dimensions: number;
  differentialEquationCode: string;
};

export type SDCPN = {
  id: string;
  title: string;
  places: Place[];
  transitions: Transition[];
};

export type SimulationInput = {
  sdcpn: SDCPN;
  initialMarking: Map<string, { values: Float64Array; count: number }>;
  seed: number;
  dt: number;
};

export type SimulationInstance = {
  sdcpn: SDCPN;
  places: Map<string, Place>;
  transitions: Map<string, Transition>;
  differentialEquationFns: Map<string, DifferentialEquationFn>;
  lambdaFns: Map<string, LambdaFn>;
  transitionKernelFns: Map<string, TransitionKernelFn>;
  dt: number;
  rngState: number;
  frames: SimulationFrame[];
  currentFrameNumber: number;
};

export type SimulationFrame = {
  simulation: SimulationInstance;
  time: number;
  places: Map<ID, { instance: Place; offset: number; count: number }>;
  transitions: Map<ID, { instance: Transition; timeSinceLastFiring: number }>;
  /**
   * Buffer containing all place values concatenated.
   *
   * Size: sum of (place.dimensions * place.count) for all places.
   *
   * Layout: For each place, its tokens are stored contiguously.
   *
   * Access to a place's token values can be done via the offset and count in the `places` map.
   */
  buffer: Float64Array;
};
