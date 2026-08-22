import type { InitialMarking } from "../api";
import type { SimulationCompletionReason } from "../engine/compute-next-frame";
import type { ParameterValues, SimulationInstance } from "../engine/types";
import type { MonteCarloFrameBuffer } from "./frame-buffer";
import type { MonteCarloRunStatus } from "./types";

export type PlaceID = string;

export type TransitionEffect = {
  remove: Record<PlaceID, Set<number> | number>;
  /** One packed token byte block (strideBytes long) per new token. */
  add: Record<PlaceID, Uint8Array[]>;
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
  /**
   * Scratch tally of tokens produced so far in the current frame, per place
   * index, used only by capacity checks.
   *
   * Output tokens are applied in one pass at the end of a frame, so the frame's
   * counts lag during transition evaluation. `null` for nets without any place
   * capacity, where the tally would never be read.
   */
  pendingOutputCounts: Uint32Array | null;
};
