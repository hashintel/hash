import { createContext } from "react";

import type {
  SimulationFrameReader,
  SimulationFrameState,
} from "@hashintel/petrinaut-core";

/**
 * A mode-agnostic source of execution frames.
 *
 * Petrinaut can show an execution coming from different backends: local
 * simulation playback, or a host-provided Actual mode stream. Frame consumers
 * (place nodes, visualizers, the timeline chart) read this interface instead
 * of a backend-specific context, so they do not need to know which backend is
 * active. The {@link ExecutionFrameProvider} in `./provider.tsx` decides which
 * adapter feeds the context based on the editor's global mode.
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
