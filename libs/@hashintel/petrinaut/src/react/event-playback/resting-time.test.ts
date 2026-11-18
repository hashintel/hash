import { describe, expect, it } from "vitest";

import { findRestingTime, type RestingTrace } from "./resting-time";

import type { RunContinuity } from "@hashintel/petrinaut-core";

type Kind = "initial" | "firing" | "reference";

/** A trace of events at the given times, as a run exposes it. */
const traceOf = (
  continuity: RunContinuity,
  events: readonly (readonly [time: number, kind: Kind])[],
): RestingTrace => ({
  continuity,
  findEventIndexAt: (time) => events.findLastIndex(([at]) => at <= time),
  getEvent: (index) => {
    const event = events[index];
    return event ? { time: event[0] } : null;
  },
  findDiscreteEventAtOrBefore: (index) => {
    for (let at = Math.min(index, events.length - 1); at >= 0; at--) {
      if (events[at]![1] !== "reference") {
        return at;
      }
    }
    return null;
  },
});

const EVENTS = [
  [0, "initial"],
  [0.4, "firing"],
  [0.5, "reference"],
  [1.7, "firing"],
  [2, "reference"],
] as const;

describe("findRestingTime", () => {
  it("rests a continuous run where it is put", () => {
    const run = traceOf("continuous", EVENTS);

    expect(findRestingTime(run, 1.2)).toBe(1.2);
    expect(findRestingTime(run, 0.5)).toBe(0.5);
  });

  it("rests a discrete run on the event at or before the time", () => {
    const run = traceOf("discrete", EVENTS);

    expect(findRestingTime(run, 0.39)).toBe(0);
    expect(findRestingTime(run, 0.4)).toBe(0.4);
    expect(findRestingTime(run, 1.69)).toBe(0.4);
    expect(findRestingTime(run, 1.7)).toBe(1.7);
  });

  it("passes over a reference frame, which records no change", () => {
    const run = traceOf("discrete", EVENTS);

    expect(findRestingTime(run, 0.5)).toBe(0.4);
    // The end of what the run covers is a reference frame too.
    expect(findRestingTime(run, 2)).toBe(1.7);
  });

  it("rests on the initial state before any event, and with no trace yet", () => {
    expect(findRestingTime(traceOf("discrete", EVENTS), -1)).toBe(0);
    expect(findRestingTime(traceOf("discrete", []), 3)).toBe(0);
  });

  it("rests an untimed run on the step it has reached", () => {
    const steps = traceOf("discrete", [
      [0, "initial"],
      [1, "firing"],
      [2, "firing"],
      [3, "firing"],
    ]);

    expect(findRestingTime(steps, 2.6)).toBe(2);
    expect(findRestingTime(steps, 3)).toBe(3);
  });
});
