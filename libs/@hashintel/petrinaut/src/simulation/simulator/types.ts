import type {
  Color,
  ID,
  Place,
  SDCPN,
  Transition,
} from "../../core/types/sdcpn";
import type { SimulationFrameState_Transition } from "../context";

export type ParameterValues = Record<string, number | boolean>;

export type DifferentialEquationFn = (
  tokens: Record<string, number>[],
  parameters: ParameterValues,
) => Record<string, number>[];

export type LambdaFn = (
  tokenValues: Record<string, Record<string, number>[]>,
  parameters: ParameterValues,
) => number | boolean;

export type TransitionKernelFn = (
  tokenValues: Record<string, Record<string, number>[]>,
  parameters: ParameterValues,
) => Record<string, Record<string, number>[]>;

export type SimulationInput = {
  sdcpn: SDCPN;
  initialMarking: Map<string, { values: Float64Array; count: number }>;
  /** Parameter values from the simulation store (overrides SDCPN defaults) */
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
};

export type SimulationInstance = {
  places: Map<string, Place>;
  transitions: Map<string, Transition>;
  types: Map<string, Color>;
  differentialEquationFns: Map<string, DifferentialEquationFn>;
  lambdaFns: Map<string, LambdaFn>;
  transitionKernelFns: Map<string, TransitionKernelFn>;
  parameterValues: ParameterValues;
  dt: number;
  rngState: number;
  frames: SimulationFrame[];
  currentFrameNumber: number;
};

export type SimulationFrame = {
  simulation: SimulationInstance;
  time: number;
  places: Map<
    ID,
    { instance: Place; offset: number; count: number; dimensions: number }
  >;
  transitions: Map<
    ID,
    SimulationFrameState_Transition & { instance: Transition }
  >;
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
