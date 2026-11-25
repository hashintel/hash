import { createReadableStore } from "../store/readable-store";
import { createInMemoryEventTraceStore } from "./trace-store";

import type { RunClock, RunContinuity } from "../extensions/net-class";
import type { SimulationFrameReader } from "../simulation/api";
import type { ReadableStore } from "../store/readable-store";
import type { SDCPN } from "../types/sdcpn";
import type { TraceEvent } from "./trace-event";

/** How much of an execution a trace holds. It changes as events arrive. */
export type TraceCoverage = {
  /** Events held, the first state included. Zero until the first arrives. */
  eventCount: number;
  /**
   * Position of the first event held. The trace says nothing of what came
   * before it, so a view of the trace never goes further back.
   */
  startTime: number;
  /**
   * Position the trace is complete up to: every event at or before it is
   * held. It moves on without an event when nothing happens.
   */
  coveredTime: number;
  /** True once the execution is over: nothing more will be appended. */
  ended: boolean;
};

/**
 * One execution of a net as the events that happened in it, whoever produced
 * them: a simulator computing a run, or a host reporting what a system did.
 *
 * A position is a number of seconds, or of steps on a net without time. The
 * trace answers the state at any position it covers, which is all a viewer
 * needs: nothing here says where the events came from.
 */
export interface ExecutionTrace {
  /** What a position counts: seconds, or the steps of an untimed net. */
  readonly clock: RunClock;
  /**
   * What lies between two events: the continuous evolution the events'
   * derivatives describe, or nothing. A viewer of a discrete execution has
   * only its events to view.
   */
  readonly continuity: RunContinuity;
  /**
   * The instant of position 0 on the wall clock, in milliseconds since the
   * Unix epoch. Null when the execution has no place in real time, as a
   * simulated one: its positions then only read as elapsed time.
   */
  readonly epochMs: number | null;
  readonly coverage: ReadableStore<TraceCoverage>;
  /** Frame place index by place id: the order of an event's per-place arrays. */
  readonly placeIndexById: ReadonlyMap<string, number>;

  /**
   * Asks the source for the trace to cover `time`. A source that computes on
   * demand computes up to it; one that reports an execution as it happens
   * has nothing to do.
   */
  demand(this: void, time: number): void;

  getEvent(this: void, index: number): TraceEvent | null;
  /** Index of the last event at or before `time`, or -1 before the first. */
  findEventIndexAt(this: void, time: number): number;
  /**
   * Index of the last discrete event (the initial state or a firing) at or
   * before `index`, or null. Reference events are skipped.
   */
  findDiscreteEventAtOrBefore(this: void, index: number): number | null;
  /** Index of the first discrete event after `index`, or null. */
  findDiscreteEventAfter(this: void, index: number): number | null;
  /** The state an event recorded. */
  getEventState(this: void, index: number): SimulationFrameReader | null;
  /** The state at any `time` the trace covers, interpolated between events. */
  getStateAt(this: void, time: number): SimulationFrameReader | null;
}

/**
 * The instant of a position on the wall clock, in milliseconds since the
 * Unix epoch. Null for an execution with no place in real time, and for one
 * that counts steps.
 */
export const wallClockMsAt = (
  trace: Pick<ExecutionTrace, "clock" | "epochMs">,
  time: number,
): number | null =>
  trace.clock === "time" && trace.epochMs !== null
    ? trace.epochMs + time * 1000
    : null;

/** What a source writes an execution through. */
export interface TraceWriter {
  /**
   * Appends events in order. The trace is then complete up to the last
   * one, or up to `coveredTime` when the source knows nothing happens
   * between the two.
   */
  append(this: void, events: readonly TraceEvent[], coveredTime?: number): void;
  /** Says nothing more happened up to `time`. */
  cover(this: void, time: number): void;
  /** Says the execution is over. */
  end(this: void): void;
}

export type ExecutionTraceConfig = {
  /** The net the execution runs on. Its places, transitions and types lay out every state. */
  net: Pick<SDCPN, "places" | "transitions" | "types">;
  clock: RunClock;
  continuity: RunContinuity;
  /** The instant of position 0 on the wall clock, when the execution has one. */
  epochMs?: number | null;
  /**
   * Called with the position the trace is asked to cover. A source that
   * computes on demand passes it; one that reports an execution as it
   * happens leaves it out.
   */
  onDemand?: (time: number) => void;
};

const EMPTY_COVERAGE: TraceCoverage = {
  eventCount: 0,
  startTime: 0,
  coveredTime: 0,
  ended: false,
};

/**
 * An empty trace and the writer that fills it. The source keeps the writer;
 * everything that shows the execution takes the trace.
 */
export function createExecutionTrace(config: ExecutionTraceConfig): {
  trace: ExecutionTrace;
  writer: TraceWriter;
} {
  const store = createInMemoryEventTraceStore(config.net);
  const coverage = createReadableStore<TraceCoverage>(EMPTY_COVERAGE);
  /** The furthest position a write has covered. A trace may start before position 0. */
  let covered = Number.NEGATIVE_INFINITY;

  /** Publishes what the store holds, with coverage that never moves back. */
  const publish = (coveredTime: number, ended: boolean): void => {
    const previous = coverage.get();
    covered = Math.max(
      covered,
      coveredTime,
      store.latest()?.time ?? Number.NEGATIVE_INFINITY,
    );
    const next: TraceCoverage = {
      eventCount: store.count(),
      startTime: store.getEvent(0)?.time ?? 0,
      coveredTime: Number.isFinite(covered) ? covered : 0,
      ended,
    };
    if (
      next.eventCount !== previous.eventCount ||
      next.startTime !== previous.startTime ||
      next.coveredTime !== previous.coveredTime ||
      next.ended !== previous.ended
    ) {
      coverage.set(next);
    }
  };

  const assertOpen = (): void => {
    if (coverage.get().ended) {
      throw new Error("An execution trace that ended takes no more events");
    }
  };

  return {
    trace: {
      clock: config.clock,
      continuity: config.continuity,
      epochMs: config.epochMs ?? null,
      coverage,
      placeIndexById: store.placeIndexById,
      demand: (time) => config.onDemand?.(time),
      getEvent: (index) => store.getEvent(index),
      findEventIndexAt: (time) => store.findIndexAt(time),
      findDiscreteEventAtOrBefore: (index) =>
        store.findDiscreteEventAtOrBefore(index),
      findDiscreteEventAfter: (index) => store.findDiscreteEventAfter(index),
      getEventState: (index) => store.getEventState(index),
      getStateAt: (time) => store.getStateAt(time),
    },
    writer: {
      append(events, coveredTime) {
        assertOpen();
        store.append(events);
        // A trace that starts later than position 0 is covered from there.
        publish(coveredTime ?? Number.NEGATIVE_INFINITY, false);
      },
      cover(time) {
        assertOpen();
        publish(time, false);
      },
      end() {
        publish(Number.NEGATIVE_INFINITY, true);
      },
    },
  };
}
