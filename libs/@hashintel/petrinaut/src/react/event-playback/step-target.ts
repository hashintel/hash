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
 * Stepping back from a time several events share passes all of them: the
 * viewed time is what a step moves, and theirs is the one already viewed.
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
  let target = trace.findDiscreteEventAtOrBefore(current);
  while (target !== null && trace.getEvent(target)?.time === time) {
    target = trace.findDiscreteEventAtOrBefore(target - 1);
  }
  return target;
};
