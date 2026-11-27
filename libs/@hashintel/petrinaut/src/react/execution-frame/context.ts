import { createContext } from "react";

import type {
  SimulationFrameReader,
  SimulationFrameState,
} from "@hashintel/petrinaut-core";

/**
 * The viewed execution by frame index.
 *
 * A frame is a recorded event of the viewed execution's trace, whichever
 * produced it: a simulation's run, or the host's execution in Actual mode.
 * Place nodes and visualizers read the viewed frame here; what reads the
 * trace itself, as the timeline does, takes it from the execution-trace
 * context instead.
 */
export type ExecutionFrameSource = {
  /**
   * Identity of the underlying run and time baseline. Consumers that
   * accumulate state derived from frames (e.g. the timeline streaming store)
   * reset their accumulation when this changes.
   */
  sourceId: string;

  /** Total number of frames currently available. */
  totalFrames: number;

  /** Index of the currently viewed frame. */
  currentFrameIndex: number;

  /** Reader for the currently viewed frame; null when no frames exist. */
  currentFrameReader: SimulationFrameReader | null;

  /**
   * Simplified state of the currently viewed frame (place token counts);
   * null when no frames exist.
   */
  currentViewedFrame: SimulationFrameState | null;

  /**
   * Move the viewed frame, e.g. from timeline scrubbing. Implementations
   * clamp the index to the available range.
   */
  scrubToFrame: (frameIndex: number) => void;

  /**
   * Read frame readers from `startIndex` (inclusive) to `endIndex`
   * (exclusive, defaults to the end of the available frames).
   */
  getFramesInRange: (
    startIndex: number,
    endIndex?: number,
  ) => Promise<SimulationFrameReader[]>;
};

export const emptyExecutionFrameSource: ExecutionFrameSource = {
  sourceId: "none",
  totalFrames: 0,
  currentFrameIndex: 0,
  currentFrameReader: null,
  currentViewedFrame: null,
  scrubToFrame: () => {},
  getFramesInRange: () => Promise.resolve([]),
};

export const ExecutionFrameSourceContext = createContext<ExecutionFrameSource>(
  emptyExecutionFrameSource,
);
