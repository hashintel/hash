import type { InitialMarking } from "../api";
import type { SimulationCompletionReason } from "../engine/compute-next-frame";
import type { ParameterValues, SimulationInstance } from "../engine/types";
import type { MonteCarloFrameBuffer } from "./frame-buffer";
import type { MonteCarloRunStatus } from "./types";

export type PlaceID = string;

export type TransitionEffect = {
  remove: Record<PlaceID, Set<number> | number>;
  add: Record<PlaceID, number[][]>;
  newRngState: number;
};

export type MonteCarloRunState = {
  index: number;
  status: MonteCarloRunStatus;
  seed: number;
  simulation: SimulationInstance;
  currentFrame: MonteCarloFrameBuffer;
  nextFrame: MonteCarloFrameBuffer;
  initialMarking: InitialMarking;
  parameterValues: ParameterValues;
  frameNumber: number;
  maxFrameNumber: number;
  rngState: number;
  completionReason: SimulationCompletionReason | null;
  error: string | null;
  reallocations: number;
};
