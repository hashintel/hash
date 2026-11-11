import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";
import {
  createEngineFrameLayout,
  readEngineFrame,
} from "../../frames/internal-frame";
import { createFixedStepStepper } from "./fixed-step-stepper";
import {
  createTraceRecorder,
  type TraceRecorder,
  type TraceRecording,
} from "./trace-recorder";

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

const recordUntilOver = (
  recorder: TraceRecorder,
  limit = 100,
): { events: TraceEvent[]; last: TraceRecording } => {
  const events: TraceEvent[] = [];
  let last: TraceRecording = {
    event: null,
    time: 0,
    completion: null,
    error: null,
  };
  for (let step = 0; step < limit; step++) {
    last = recorder.next();
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

describe("createFixedStepStepper", () => {
  it("hands back after a bounded number of steps when no stop is named, and keeps its reference times", () => {
    const create = () =>
      createFixedStepStepper(
        {
          sdcpn: idle,
          hirArtifacts: compileHirArtifacts(idle).artifacts,
          initialMarking: { hold: 1 },
          parameterValues: {},
          seed: 1,
          maxTime: null,
        },
        // 50,000 steps between two reference states.
        { dt: 0.000002 },
      );

    const stepper = create();
    const advances = Array.from({ length: 5 }, () => stepper.advance());
    expect(advances.map((advance) => advance.kind)).toEqual([
      "stopped",
      "stopped",
      "stopped",
      "stopped",
      "reference",
    ]);
    expect(advances.map((advance) => advance.time)).toEqual(
      [0.02, 0.04, 0.06, 0.08, 0.1].map((time) => expect.closeTo(time, 9)),
    );

    const stopped = create().advance(1);
    expect(stopped.kind).toBe("reference");
    expect(stopped.time).toBeCloseTo(0.1, 9);
  });

  it("records the initial state, one event per step with a firing, and the run's last state", () => {
    const stepper = createFixedStepStepper(
      {
        sdcpn: drain,
        initialMarking: { source: 3, sink: 0 },
        parameterValues: {},
        seed: 1,
        maxTime: null,
      },
      { dt: 0.0001 },
    );
    const recorder = createTraceRecorder(stepper);

    expect(recorder.initialEvent).toMatchObject({
      index: 0,
      time: 0,
      kind: "initial",
    });
    expect(counts(recorder.initialEvent)).toEqual([3, 0]);

    const { events, last } = recordUntilOver(recorder);

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

    // Advancing an over run stays over.
    expect(recorder.next()).toMatchObject({
      event: null,
      completion: "deadlock",
    });
    expect(stepper.advance()).toMatchObject({
      kind: "stopped",
      completion: "deadlock",
    });
  });

  it("asks for a reference state every tenth of a simulated second and stops at max time", () => {
    const { artifacts, failures } = compileHirArtifacts(idle);
    expect(failures).toEqual([]);

    const recorder = createTraceRecorder(
      createFixedStepStepper(
        {
          sdcpn: idle,
          hirArtifacts: artifacts,
          initialMarking: { hold: 1 },
          parameterValues: {},
          seed: 1,
          maxTime: 0.25,
        },
        { dt: 0.05 },
      ),
    );

    const { events, last } = recordUntilOver(recorder);

    // Nothing ever fires, so the trace is reference events alone: every two
    // steps, and one for the last state at max time.
    expect(events.map((event) => event.kind)).toEqual([
      "reference",
      "reference",
      "reference",
    ]);
    expectTimes(events, [0.1, 0.2, 0.25]);
    expect(last.completion).toBe("maxTime");
    expect(
      events.every((event) => event.derivatives.every((d) => d === null)),
    ).toBe(true);
  });
});

describe("createFixedStepStepper stopped at times of the caller's", () => {
  it("stops at the last step at or before the time, keeping nothing, and resumes from there", () => {
    const { artifacts } = compileHirArtifacts(idle);
    const stepper = createFixedStepStepper(
      {
        sdcpn: idle,
        hirArtifacts: artifacts,
        initialMarking: { hold: 1 },
        parameterValues: {},
        seed: 1,
        maxTime: 1,
      },
      { dt: 0.02 },
    );

    // 0.05 is between two steps: the stepper stops on the one before it.
    expect(stepper.advance(0.05)).toMatchObject({ kind: "stopped" });
    expect(stepper.time).toBeCloseTo(0.04, 12);
    // A stop on a step is reached exactly.
    expect(stepper.advance(0.06)).toMatchObject({ kind: "stopped" });
    expect(stepper.time).toBeCloseTo(0.06, 12);
    // A stop already reached moves nothing.
    expect(stepper.advance(0.06)).toMatchObject({ kind: "stopped" });
    expect(stepper.time).toBeCloseTo(0.06, 12);
    // The reference state still comes a tenth of a second after the start.
    expect(stepper.advance(0.5)).toMatchObject({ kind: "reference" });
    expect(stepper.time).toBeCloseTo(0.1, 12);
  });
});
