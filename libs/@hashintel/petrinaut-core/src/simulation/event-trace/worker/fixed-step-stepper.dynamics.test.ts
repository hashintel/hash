import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../../../hir/compile";
import { createInMemoryEventTraceStore } from "../trace-store";
import { createFixedStepStepper } from "./fixed-step-stepper";
import { createTraceRecorder } from "./trace-recorder";

import type { SDCPN } from "../../../types/sdcpn";

/**
 * One token whose `x` grows at `rate` per second, watched by a transition
 * that never fires (rate 0) but keeps the net out of deadlock.
 */
const growth: SDCPN = {
  places: [
    {
      id: "cell",
      name: "Cell",
      colorId: "real",
      dynamicsEnabled: true,
      dynamics: [{ differentialEquationId: "grow" }],
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
      lambdaCode: `export default Lambda((input, parameters) => 0 * parameters.rate);`,
      transitionKernelCode: "",
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "real",
      name: "Real",
      iconSlug: "circle",
      displayColor: "#000",
      elements: [{ elementId: "x", name: "x", type: "real" }],
    },
  ],
  differentialEquations: [
    {
      id: "grow",
      name: "Grow",
      colorId: "real",
      arity: 1,
      code: `export default Dynamics((token, parameters) => ({ x: parameters.rate }));`,
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
};

describe("createFixedStepStepper with dynamics", () => {
  it("records each token's derivative on every event, and the store interpolates between them", () => {
    const { artifacts, failures } = compileHirArtifacts(growth);
    expect(failures).toEqual([]);

    const recorder = createTraceRecorder(
      createFixedStepStepper(
        {
          sdcpn: growth,
          hirArtifacts: artifacts,
          initialMarking: { cell: [{ x: 0 }] },
          parameterValues: {},
          seed: 1,
          maxTime: 0.25,
        },
        { dt: 0.05 },
      ),
    );
    expect(Array.from(recorder.initialEvent.derivatives[0]!)).toEqual([2]);

    const store = createInMemoryEventTraceStore(growth);
    store.append([recorder.initialEvent]);
    for (;;) {
      const result = recorder.next();
      if (result.event) {
        store.append([result.event]);
      }
      if (result.completion !== null) {
        break;
      }
    }

    const times = Array.from(
      { length: store.count() },
      (_, index) => store.getEvent(index)!.time,
    );
    expect(times).toEqual([0, 0.1, 0.2, 0.25]);
    for (let index = 0; index < store.count(); index++) {
      expect(Array.from(store.getEvent(index)!.derivatives[0]!)).toEqual([2]);
    }

    const x = (time: number) =>
      store.getStateAt(time)?.getPlaceTokens(growth.places[0]!)[0]?.x;
    // Recorded by the engine's Euler steps at the events, and by the Hermite
    // curve (a straight line here, both slopes being equal) in between.
    expect(x(0.1)).toBeCloseTo(0.2, 12);
    expect(x(0.15)).toBeCloseTo(0.3, 12);
    expect(x(0.25)).toBeCloseTo(0.5, 12);
  });
});
