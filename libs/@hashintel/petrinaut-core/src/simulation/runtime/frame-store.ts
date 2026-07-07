import { compileSimulationFrameReader } from "../frames/frame-reader";

import type { SDCPN } from "../../types/sdcpn";
import type { SimulationFrameReader } from "../api";
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
 * Default in-memory store for the worker protocol. It keeps all full frame
 * payloads in memory, while hiding that retention policy from `Simulation`.
 */
export function createInMemorySimulationFrameStore(
  sdcpn: Pick<SDCPN, "places" | "transitions" | "types">,
): SimulationFrameStore {
  const frames: SimulationFramePayload[] = [];
  const createFrameReader = compileSimulationFrameReader(sdcpn);

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
      return frame ? createFrameReader(frame.frame, index, frame.time) : null;
    },
    get(index) {
      const frame = frames[index];
      return frame ? createFrameReader(frame.frame, index, frame.time) : null;
    },
  };
}
