import { describe, expect, it } from "vitest";

import { findStepTargetIndex, type StepTargetTrace } from "./step-target";

type Kind = "initial" | "firing" | "reference";

const traceOf = (events: { time: number; kind: Kind }[]): StepTargetTrace => ({
  findEventIndexAt: (time) =>
    events.findLastIndex((event) => event.time <= time),
  getEvent: (index) => events[index] ?? null,
  findDiscreteEventAtOrBefore: (index) => {
    for (let at = Math.min(index, events.length - 1); at >= 0; at -= 1) {
      if (events[at]!.kind !== "reference") {
        return at;
      }
    }
    return null;
  },
  findDiscreteEventAfter: (index) => {
    for (let at = Math.max(index + 1, 0); at < events.length; at += 1) {
      if (events[at]!.kind !== "reference") {
        return at;
      }
    }
    return null;
  },
});

describe("findStepTargetIndex", () => {
  //  index: 0        1          2       3          4          5       6
  const trace = traceOf([
    { time: 0, kind: "initial" },
    { time: 0.1, kind: "reference" },
    { time: 0.15, kind: "firing" },
    { time: 0.25, kind: "reference" },
    { time: 0.35, kind: "reference" },
    { time: 0.4, kind: "firing" },
    { time: 0.5, kind: "reference" },
  ]);

  it("steps forward to the next firing, over reference frames", () => {
    expect(findStepTargetIndex(trace, 0, 1)).toBe(2);
    expect(findStepTargetIndex(trace, 0.15, 1)).toBe(5);
    expect(findStepTargetIndex(trace, 0.3, 1)).toBe(5);
  });

  it("has nothing after the last firing, even with reference frames behind it", () => {
    expect(findStepTargetIndex(trace, 0.4, 1)).toBeNull();
    expect(findStepTargetIndex(trace, 0.5, 1)).toBeNull();
  });

  it("steps back to the earlier firing first from between events", () => {
    expect(findStepTargetIndex(trace, 0.3, -1)).toBe(2);
    expect(findStepTargetIndex(trace, 0.45, -1)).toBe(5);
    expect(findStepTargetIndex(trace, 0.5, -1)).toBe(5);
  });

  it("steps back from a firing to the previous one, then to the initial state", () => {
    expect(findStepTargetIndex(trace, 0.4, -1)).toBe(2);
    expect(findStepTargetIndex(trace, 0.15, -1)).toBe(0);
    expect(findStepTargetIndex(trace, 0, -1)).toBeNull();
  });

  it("steps back past every firing that shares the viewed time", () => {
    //  index: 0        1       2       3          4
    const simultaneous = traceOf([
      { time: 0, kind: "initial" },
      { time: 0.2, kind: "firing" },
      { time: 0.2, kind: "firing" },
      { time: 0.2, kind: "reference" },
      { time: 0.4, kind: "firing" },
    ]);
    expect(findStepTargetIndex(simultaneous, 0.4, -1)).toBe(2);
    expect(findStepTargetIndex(simultaneous, 0.2, -1)).toBe(0);
    expect(findStepTargetIndex(simultaneous, 0.3, -1)).toBe(2);
  });

  it("has no target in an empty trace", () => {
    expect(findStepTargetIndex(traceOf([]), 0, 1)).toBeNull();
    expect(findStepTargetIndex(traceOf([]), 0, -1)).toBeNull();
  });
});
