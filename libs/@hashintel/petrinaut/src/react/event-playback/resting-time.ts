import type { RunContinuity, TraceEvent } from "@hashintel/petrinaut-core";

/** What resting reads from a run. */
export type RestingTrace = {
  continuity: RunContinuity;
  findEventIndexAt: (time: number) => number;
  getEvent: (index: number) => Pick<TraceEvent, "time"> | null;
  findDiscreteEventAtOrBefore: (index: number) => number | null;
};

/**
 * The position a view of the run rests at when it is put at `time`.
 *
 * A continuous run has a state of its own at every time, so the view rests
 * where it is put. A discrete run changes only at its events: between two
 * of them there is nothing the earlier one did not already show. Its view
 * rests on the last event at or before `time`, the initial state or a
 * firing. A reference frame is not one: it records no change.
 */
export const findRestingTime = (trace: RestingTrace, time: number): number => {
  if (trace.continuity === "continuous") {
    return time;
  }
  const index = trace.findDiscreteEventAtOrBefore(trace.findEventIndexAt(time));
  return (index === null ? null : trace.getEvent(index)?.time) ?? 0;
};
