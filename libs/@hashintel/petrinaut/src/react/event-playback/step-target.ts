import type { TraceEvent } from "@hashintel/petrinaut-core";

/** What stepping reads from a run. */
export type StepTargetTrace = {
  findEventIndexAt: (time: number) => number;
  getEvent: (index: number) => Pick<TraceEvent, "time"> | null;
  findDiscreteEventAtOrBefore: (index: number) => number | null;
  findDiscreteEventAfter: (index: number) => number | null;
};

/**
 * Index of the event viewed after stepping from `time` in `direction`, or
 * null at either end of the trace.
 *
 * Only discrete events count: the initial state and the firings. Reference
 * frames, which the trace keeps for the continuous evolution, are stepped
 * over. Stepping back from between two events lands on the earlier one first.
 */
export const findStepTargetIndex = (
  trace: StepTargetTrace,
  time: number,
  direction: -1 | 1,
): number | null => {
  const current = trace.findEventIndexAt(time);
  if (direction === 1) {
    return trace.findDiscreteEventAfter(current);
  }
  const atEvent = trace.getEvent(current)?.time === time;
  return trace.findDiscreteEventAtOrBefore(atEvent ? current - 1 : current);
};
