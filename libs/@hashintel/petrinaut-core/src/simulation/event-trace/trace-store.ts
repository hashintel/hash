import { compileSimulationFrameReader } from "../frames/frame-reader";
import { createEngineFrameLayout } from "../frames/internal-frame";
import { interpolateFrame } from "./interpolation";
import { isDiscreteEvent } from "./trace";

import type { SDCPN } from "../../types/sdcpn";
import type { SimulationFrameReader } from "../api";
import type { TraceEvent } from "./trace";

export interface EventTraceStore {
  /** Frame place index by place id: the order of an event's per-place arrays. */
  readonly placeIndexById: ReadonlyMap<string, number>;
  append(events: readonly TraceEvent[]): void;
  clear(): void;
  count(): number;
  latest(): TraceEvent | null;
  getEvent(index: number): TraceEvent | null;
  /** Index of the last event at or before `time`, or -1 before the first. */
  findIndexAt(time: number): number;
  /** Index of the last discrete event at or before `index`, or null. */
  findDiscreteEventAtOrBefore(index: number): number | null;
  /** Index of the first discrete event after `index`, or null. */
  findDiscreteEventAfter(index: number): number | null;
  /** The state an event recorded, as it was recorded. */
  getEventState(index: number): SimulationFrameReader | null;
  /**
   * The state at `time`: the last event at or before it, with the
   * continuous attributes carried forward to `time` (see `interpolateFrame`).
   * Null before the first event.
   */
  getStateAt(time: number): SimulationFrameReader | null;
}

/** Index of the last event whose time is at or before `time`, by bisection. */
export const findLastEventIndexAt = (
  events: readonly { time: number }[],
  time: number,
): number => {
  let low = 0;
  let high = events.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle]!.time <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
};

/**
 * Keeps every event of a run in memory and answers state queries from them.
 *
 * The store also owns the main-thread copy of the worker's string pool, as
 * the frame store does: each event's `newStrings` delta is applied before
 * the event is kept, so any frame in the store only references pool ids the
 * copy already holds.
 */
export function createInMemoryEventTraceStore(
  sdcpn: Pick<SDCPN, "places" | "transitions" | "types">,
): EventTraceStore {
  const layout = createEngineFrameLayout(sdcpn);
  const events: TraceEvent[] = [];
  let stringPool: string[] = [""];
  const createFrameReader = compileSimulationFrameReader(sdcpn, {
    get: (id) => stringPool[id] ?? "",
  });

  const push = (event: TraceEvent): void => {
    const delta = event.newStrings;
    if (delta) {
      if (delta.baseId !== stringPool.length) {
        throw new Error(
          `Event trace string pool delta out of order: baseId ${delta.baseId}, expected ${stringPool.length}`,
        );
      }
      for (const value of delta.values) {
        stringPool.push(value);
      }
    }
    if (event.index !== events.length) {
      throw new Error(
        `Event trace out of order: received event ${event.index}, expected ${events.length}`,
      );
    }
    events.push(event);
  };

  return {
    placeIndexById: layout.placeIndexById,
    append(batch) {
      for (const event of batch) {
        push(event);
      }
    },
    clear() {
      events.length = 0;
      stringPool = [""];
    },
    count: () => events.length,
    latest: () => events[events.length - 1] ?? null,
    getEvent: (index) => events[index] ?? null,
    findIndexAt: (time) => findLastEventIndexAt(events, time),
    findDiscreteEventAtOrBefore(index) {
      for (let at = Math.min(index, events.length - 1); at >= 0; at -= 1) {
        if (isDiscreteEvent(events[at]!)) {
          return at;
        }
      }
      return null;
    },
    findDiscreteEventAfter(index) {
      for (let at = Math.max(index + 1, 0); at < events.length; at += 1) {
        if (isDiscreteEvent(events[at]!)) {
          return at;
        }
      }
      return null;
    },
    getEventState(index) {
      const event = events[index];
      return event
        ? createFrameReader(event.frame, event.index, event.time)
        : null;
    },
    getStateAt(time) {
      const index = findLastEventIndexAt(events, time);
      const from = events[index];
      if (!from) {
        return null;
      }
      const frame = interpolateFrame(
        layout,
        from,
        events[index + 1] ?? null,
        time,
      );
      return createFrameReader(frame, index, time);
    },
  };
}
