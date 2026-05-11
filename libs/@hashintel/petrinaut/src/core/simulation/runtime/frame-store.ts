import type { SimulationFrameReader } from "../api";
import { createSimulationFrameReader } from "../frames/frame-reader";
import type { SimulationFramePayload } from "../worker/frame-payload";

export interface SimulationFrameStore {
  append(frame: SimulationFramePayload): void;
  appendBatch(frames: SimulationFramePayload[]): void;
  clear(): void;
  count(): number;
  latest(): SimulationFrameReader | null;
  get(index: number): SimulationFrameReader | null;
}

/**
 * Compatibility store for the v1 worker protocol. It keeps all full frame
 * payloads in memory, while hiding that retention policy from `Simulation`.
 */
export function createInMemorySimulationFrameStore(): SimulationFrameStore {
  const frames: SimulationFramePayload[] = [];

  return {
    append(frame) {
      frames.push(frame);
    },
    appendBatch(nextFrames) {
      frames.push(...nextFrames);
    },
    clear() {
      frames.length = 0;
    },
    count() {
      return frames.length;
    },
    latest() {
      const index = frames.length - 1;
      const frame = frames[index];
      return frame ? createSimulationFrameReader(frame, index) : null;
    },
    get(index) {
      const frame = frames[index];
      return frame ? createSimulationFrameReader(frame, index) : null;
    },
  };
}
