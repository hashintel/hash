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
 * Compatibility store for the v1 worker protocol. It keeps all full frame
 * payloads in memory, while hiding that retention policy from `Simulation`.
 *
 * The store also owns the main-thread copy of the worker's string intern
 * pool: each payload's `newStrings` delta is applied (append-only, in order)
 * before the frame is stored, so any frame in the store only references pool
 * IDs the copy already holds. Frame readers decode string fields through it.
 */
export function createInMemorySimulationFrameStore(
  sdcpn: Pick<SDCPN, "places" | "transitions" | "types">,
): SimulationFrameStore {
  const frames: SimulationFramePayload[] = [];
  // id 0 is pre-seeded as "" to mirror the worker's pool.
  let stringPool: string[] = [""];
  const createFrameReader = compileSimulationFrameReader(sdcpn, {
    get: (id) => stringPool[id] ?? "",
  });

  function applyNewStrings(payload: SimulationFramePayload): void {
    const delta = payload.newStrings;
    if (!delta) {
      return;
    }
    if (delta.baseId !== stringPool.length) {
      throw new Error(
        `Frame store string pool delta out of order: baseId ${delta.baseId}, expected ${stringPool.length}`,
      );
    }
    stringPool.push(...delta.values);
  }

  function push(payload: SimulationFramePayload): void {
    applyNewStrings(payload);
    frames.push(payload);
  }

  return {
    append(frame) {
      push(frame);
    },
    appendBatch(nextFrames) {
      for (const frame of nextFrames) {
        push(frame);
      }
    },
    clear() {
      frames.length = 0;
      stringPool = [""];
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
