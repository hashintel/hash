import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";
import {
  createEngineFrameLayout,
  readEngineFrame,
} from "../../frames/internal-frame";
import { createTraceStepper, type TraceStepResult } from "./trace-stepper";

import type { SDCPN } from "../../../types/sdcpn";
import type { TraceEvent } from "../trace";

const place = (id: string, name: string): SDCPN["places"][number] => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

/** `source` drains into `sink` through a transition with no lambda, which fires on every step it is enabled. */
const drain: SDCPN = {
  places: [place("source", "Source"), place("sink", "Sink")],
  transitions: [
    {
      id: "move",
      name: "Move",
      inputArcs: [{ placeId: "source", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "sink", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/** A transition that stays enabled and never fires, so the run neither deadlocks nor records a firing. */
const idle: SDCPN = {
  places: [place("hold", "Hold")],
  transitions: [
    {
      id: "never",
      name: "Never",
      inputArcs: [{ placeId: "hold", weight: 1, type: "read" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => false);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const layout = createEngineFrameLayout(drain);

const counts = (event: TraceEvent): number[] =>
  Array.from(readEngineFrame(layout, event.frame).placeCounts);

const stepUntilOver = (
  stepper: ReturnType<typeof createTraceStepper>,
  limit = 100,
): { events: TraceEvent[]; last: TraceStepResult } => {
  const events: TraceEvent[] = [];
  let last: TraceStepResult = {
    event: null,
    time: 0,
    completion: null,
    error: null,
  };
  for (let step = 0; step < limit; step++) {
    last = stepper.step();
    if (last.event) {
      events.push(last.event);
    }
    if (last.completion !== null || last.error !== null) {
      break;
    }
  }
  return { events, last };
};

const expectTimes = (events: TraceEvent[], times: number[]) => {
  expect(events).toHaveLength(times.length);
  for (const [index, time] of times.entries()) {
    expect(events[index]!.time).toBeCloseTo(time, 12);
  }
};

describe("createTraceStepper", () => {
  it("records the initial state, one event per step with a firing, and the run's last state", () => {
    const stepper = createTraceStepper({
      sdcpn: drain,
      initialMarking: { source: 3, sink: 0 },
      parameterValues: {},
      seed: 1,
      maxTime: null,
      stepDt: 0.0001,
      referenceInterval: 0.1,
    });

    expect(stepper.initialEvent).toMatchObject({
      index: 0,
      time: 0,
      kind: "initial",
    });
    expect(counts(stepper.initialEvent)).toEqual([3, 0]);

    const { events, last } = stepUntilOver(stepper);

    // Three firings drain the source, then the fourth step finds nothing
    // enabled: a deadlock, recorded as a reference event at the final time.
    expect(events.map((event) => event.kind)).toEqual([
      "firing",
      "firing",
      "firing",
      "reference",
    ]);
    expect(events.map((event) => event.index)).toEqual([1, 2, 3, 4]);
    expectTimes(events, [0.0001, 0.0002, 0.0003, 0.0004]);
    expect(events[0]!.firedTransitionIds).toEqual(["move"]);
    expect(Array.from(events[0]!.touchedPlaceIndices)).toEqual([0, 1]);
    expect(events.map(counts)).toEqual([
      [2, 1],
      [1, 2],
      [0, 3],
      [0, 3],
    ]);
    expect(events[3]!.firedTransitionIds).toEqual([]);
    expect(last.completion).toBe("deadlock");
    expect(stepper.time).toBeCloseTo(0.0004, 12);

    // Stepping an over run stays over.
    expect(stepper.step()).toMatchObject({
      event: null,
      completion: "deadlock",
    });
  });

  it("records reference events at the configured interval and stops at max time", () => {
    const { artifacts, failures } = compileHirArtifacts(idle);
    expect(failures).toEqual([]);

    const stepper = createTraceStepper({
      sdcpn: idle,
      hirArtifacts: artifacts,
      initialMarking: { hold: 1 },
      parameterValues: {},
      seed: 1,
      maxTime: 0.0005,
      stepDt: 0.0001,
      referenceInterval: 0.0002,
    });

    const { events, last } = stepUntilOver(stepper);

    // Nothing ever fires, so the trace is reference events alone: every two
    // steps, and one for the last state at max time.
    expect(events.map((event) => event.kind)).toEqual([
      "reference",
      "reference",
      "reference",
    ]);
    expectTimes(events, [0.0002, 0.0004, 0.0005]);
    expect(last.completion).toBe("maxTime");
    expect(
      events.every((event) => event.derivatives.every((d) => d === null)),
    ).toBe(true);
  });
});
