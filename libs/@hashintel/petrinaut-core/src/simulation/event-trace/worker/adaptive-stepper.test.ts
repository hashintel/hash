import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";
import {
  createEngineFrameLayout,
  readEngineFrame,
} from "../../frames/internal-frame";
import { createInMemoryEventTraceStore } from "../trace-store";
import { createAdaptiveStepper } from "./adaptive-stepper";

import type { SDCPN } from "../../../types/sdcpn";
import type { TraceEvent } from "../trace";
import type { TraceStepResult } from "./trace-stepper";

const realType: SDCPN["types"][number] = {
  id: "real",
  name: "Real",
  iconSlug: "circle",
  displayColor: "#000",
  elements: [{ elementId: "x", name: "x", type: "real" }],
};

const uncoloured = (id: string, name: string): SDCPN["places"][number] => ({
  id,
  name,
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
});

/** One place of real tokens following `code`, watched by a transition that never fires. */
const dynamicsNet = (code: string, arity = 1): SDCPN => ({
  places: [
    {
      id: "cell",
      name: "Cell",
      colorId: "real",
      dynamicsEnabled: true,
      dynamics: [{ differentialEquationId: "move" }],
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "watch",
      name: "Watch",
      inputArcs: [{ placeId: "cell", weight: 1, type: "read" }],
      outputArcs: [],
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 0);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [realType],
  differentialEquations: [
    {
      id: "move",
      name: "Move",
      colorId: "real",
      arity,
      code: `export default Dynamics(${code});`,
    },
  ],
  parameters: [
    {
      id: "rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "2",
    },
  ],
});

/** `source` drains into `sink` through a transition with no lambda, which fires as soon as it is enabled. */
const drain: SDCPN = {
  places: [uncoloured("source", "Source"), uncoloured("sink", "Sink")],
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

/** A source firing at rate 5 into `sink`. */
const poisson: SDCPN = {
  places: [uncoloured("sink", "Sink")],
  transitions: [
    {
      id: "arrive",
      name: "Arrive",
      inputArcs: [],
      outputArcs: [{ placeId: "sink", weight: 1 }],
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 5);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

/** A token whose `x` grows at 1 per second until a predicate on it consumes it. */
const threshold: SDCPN = {
  places: [
    {
      id: "cell",
      name: "Cell",
      colorId: "real",
      dynamicsEnabled: true,
      dynamics: [{ differentialEquationId: "move" }],
      x: 0,
      y: 0,
    },
    uncoloured("done", "Done"),
  ],
  transitions: [
    {
      id: "cross",
      name: "Cross",
      inputArcs: [{ placeId: "cell", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "done", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda((input) => input.Cell[0].x >= 0.55);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [realType],
  differentialEquations: [
    {
      id: "move",
      name: "Move",
      colorId: "real",
      arity: 1,
      code: "export default Dynamics((token) => ({ x: 1 }));",
    },
  ],
  parameters: [],
};

/** A predicate that holds whatever the state, with a read arc: it never disables. */
const stuck: SDCPN = {
  places: [uncoloured("hold", "Hold")],
  transitions: [
    {
      id: "always",
      name: "Always",
      inputArcs: [{ placeId: "hold", weight: 1, type: "read" }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const compile = (sdcpn: SDCPN) => {
  const { artifacts, failures } = compileHirArtifacts(sdcpn, undefined, {
    includeHir: true,
  });
  expect(failures).toEqual([]);
  return artifacts;
};

const stepUntilOver = (
  stepper: ReturnType<typeof createAdaptiveStepper>,
  limit = 100_000,
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

const expectTimes = (events: readonly TraceEvent[], times: number[]) => {
  expect(events).toHaveLength(times.length);
  for (const [index, time] of times.entries()) {
    expect(events[index]!.time).toBeCloseTo(time, 12);
  }
};

const tokenX = (sdcpn: SDCPN, event: TraceEvent): number[] => {
  const layout = createEngineFrameLayout(sdcpn);
  const view = readEngineFrame(layout, event.frame);
  const count = view.placeCounts[0] ?? 0;
  const stride = layout.placeStrideBytes[0] ?? 0;
  const offset = view.placeByteOffsets[0] ?? 0;
  const values: number[] = [];
  for (let token = 0; token < count; token++) {
    values.push(
      new Float64Array(
        view.tokenBytes.slice(
          offset + token * stride,
          offset + token * stride + 8,
        ).buffer,
      )[0]!,
    );
  }
  return values;
};

describe("createAdaptiveStepper", () => {
  it("advances affine dynamics exactly and records no error", () => {
    const sdcpn = dynamicsNet(
      "(token, parameters) => ({ x: parameters.rate })",
    );
    const stepper = createAdaptiveStepper({
      sdcpn,
      hirArtifacts: compile(sdcpn),
      initialMarking: { cell: [{ x: 0 }, { x: 1 }] },
      parameterValues: {},
      seed: 1,
      maxTime: 0.35,
      referenceInterval: 0.1,
      tolerance: 1e-6,
    });
    expect(stepper.dynamicsKinds.get("cell")).toBe("affine");
    expect(Array.from(stepper.initialEvent.derivatives[0]!)).toEqual([2, 2]);

    const { events, last } = stepUntilOver(stepper);
    expect(events.map((event) => event.kind)).toEqual([
      "reference",
      "reference",
      "reference",
      "reference",
    ]);
    expectTimes(events, [0.1, 0.2, 0.3, 0.35]);
    expect(last.completion).toBe("maxTime");
    const [a, b] = tokenX(sdcpn, events[3]!);
    expect(a).toBeCloseTo(0.7, 12);
    expect(b).toBeCloseTo(1.7, 12);
    expect(Array.from(events[3]!.solverError!)).toEqual([0]);
  });

  it("integrates nonlinear per-token dynamics within the tolerance and accounts for the error", () => {
    const sdcpn = dynamicsNet("(token) => ({ x: -token.x * token.x })");
    const stepper = createAdaptiveStepper({
      sdcpn,
      hirArtifacts: compile(sdcpn),
      initialMarking: { cell: [{ x: 1 }, { x: 4 }] },
      parameterValues: {},
      seed: 1,
      maxTime: 2,
      referenceInterval: 0.1,
      tolerance: 1e-6,
    });
    expect(stepper.dynamicsKinds.get("cell")).toBe("independent");

    const { events, last } = stepUntilOver(stepper);
    expect(last.completion).toBe("maxTime");
    const final = events[events.length - 1]!;
    expect(final.time).toBe(2);
    // x' = -x² has the solution 1 / (1 / x₀ + t).
    const [a, b] = tokenX(sdcpn, final);
    expect(a).toBeCloseTo(1 / 3, 5);
    expect(b).toBeCloseTo(1 / 2.25, 5);
    const errors = events.map((event) => event.solverError![0]!);
    expect(errors[0]).toBeGreaterThan(0);
    for (let index = 1; index < errors.length; index++) {
      expect(errors[index]).toBeGreaterThanOrEqual(errors[index - 1]!);
    }
    expect(final.solverError![0]).toBeLessThan(1e-4);

    const store = createInMemoryEventTraceStore(sdcpn);
    store.append([stepper.initialEvent, ...events]);
    const x = store.getStateAt(0.25)?.getPlaceTokens(sdcpn.places[0]!)[0]?.x;
    expect(x).toBeCloseTo(1 / 1.25, 3);
  });

  it("integrates a place as one system when an equation couples its tokens", () => {
    // Each of three tokens is in two pairs, and each pair pushes both at 1.
    const sdcpn = dynamicsNet("(a, b) => [{ x: 1 }, { x: 1 }]", 2);
    const stepper = createAdaptiveStepper({
      sdcpn,
      hirArtifacts: compile(sdcpn),
      initialMarking: { cell: [{ x: 0 }, { x: 0 }, { x: 0 }] },
      parameterValues: {},
      seed: 1,
      maxTime: 1,
      referenceInterval: 1,
      tolerance: 1e-6,
    });
    expect(stepper.dynamicsKinds.get("cell")).toBe("coupled");
    const { events } = stepUntilOver(stepper);
    const [a, b, c] = tokenX(sdcpn, events[0]!);
    expect(a).toBeCloseTo(2, 9);
    expect(b).toBeCloseTo(2, 9);
    expect(c).toBeCloseTo(2, 9);
  });

  it("fires an immediate transition without advancing time, then deadlocks", () => {
    const layout = createEngineFrameLayout(drain);
    const stepper = createAdaptiveStepper({
      sdcpn: drain,
      initialMarking: { source: 3, sink: 0 },
      parameterValues: {},
      seed: 1,
      maxTime: null,
      referenceInterval: 0.1,
      tolerance: 1e-6,
    });
    const { events, last } = stepUntilOver(stepper);
    expect(events.map((event) => event.kind)).toEqual([
      "firing",
      "firing",
      "firing",
    ]);
    expect(events.map((event) => event.time)).toEqual([0, 0, 0]);
    expect(
      events.map((event) =>
        Array.from(readEngineFrame(layout, event.frame).placeCounts),
      ),
    ).toEqual([
      [2, 1],
      [1, 2],
      [0, 3],
    ]);
    expect(events[0]!.firedTransitionIds).toEqual(["move"]);
    expect(Array.from(events[0]!.touchedPlaceIndices)).toEqual([0, 1]);
    expect(last.completion).toBe("deadlock");
    expect(stepper.time).toBe(0);
  });

  it("samples firing times from the rate and keeps reference events between them", () => {
    const stepper = createAdaptiveStepper({
      sdcpn: poisson,
      hirArtifacts: compile(poisson),
      initialMarking: { sink: 0 },
      parameterValues: {},
      seed: 7,
      maxTime: 40,
      referenceInterval: 0.1,
      tolerance: 1e-6,
    });
    const { events, last } = stepUntilOver(stepper);
    expect(last.completion).toBe("maxTime");

    const firings = events.filter((event) => event.kind === "firing");
    // Rate 5 over 40 seconds: 200 firings in expectation, spread ±14.
    expect(firings.length).toBeGreaterThan(150);
    expect(firings.length).toBeLessThan(250);
    for (let index = 1; index < events.length; index++) {
      expect(events[index]!.time).toBeGreaterThan(events[index - 1]!.time);
    }
    // No stretch without an event is longer than the reference interval.
    const times = [0, ...events.map((event) => event.time)];
    for (let index = 1; index < times.length; index++) {
      expect(times[index]! - times[index - 1]!).toBeLessThanOrEqual(
        0.1 + 1e-12,
      );
    }
    const layout = createEngineFrameLayout(poisson);
    const final = readEngineFrame(layout, events[events.length - 1]!.frame);
    expect(final.placeCounts[0]).toBe(firings.length);
  });

  it("fires a predicate at the instant its condition starts to hold", () => {
    const stepper = createAdaptiveStepper({
      sdcpn: threshold,
      hirArtifacts: compile(threshold),
      initialMarking: { cell: [{ x: 0 }], done: 0 },
      parameterValues: {},
      seed: 1,
      maxTime: null,
      referenceInterval: 0.1,
      tolerance: 1e-6,
    });
    const { events, last } = stepUntilOver(stepper);
    const firing = events.find((event) => event.kind === "firing");
    expect(firing).toBeDefined();
    expect(firing!.time).toBeCloseTo(0.55, 9);
    expect(firing!.firedTransitionIds).toEqual(["cross"]);
    expectTimes(
      events.filter((event) => event.kind === "reference"),
      [0.1, 0.2, 0.3, 0.4, 0.5],
    );
    expect(last.completion).toBe("deadlock");
  });

  it("fails a run whose immediate transition never disables", () => {
    const stepper = createAdaptiveStepper({
      sdcpn: stuck,
      hirArtifacts: compile(stuck),
      initialMarking: { hold: 1 },
      parameterValues: {},
      seed: 1,
      maxTime: null,
      referenceInterval: 0.1,
      tolerance: 1e-6,
    });
    const { last } = stepUntilOver(stepper);
    expect(last.error).toContain("Always");
    expect(stepper.time).toBe(0);
  });
});
