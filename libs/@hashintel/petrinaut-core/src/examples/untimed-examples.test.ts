import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir";
import { lowerScenarioToHir } from "../hir/scenario";
import { isTimedNet } from "../net-timing";
import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import { createStepStepper } from "../simulation/event-trace/worker/step-stepper";
import { createTraceRecorder } from "../simulation/event-trace/worker/trace-recorder";
import {
  createEngineFrameLayout,
  readEngineFrame,
} from "../simulation/frames/internal-frame";
import { bicycleAssembly } from "./bicycle-assembly";
import { wheelTruing } from "./wheel-truing";

import type { SDCPN } from "../types/sdcpn";

/** The token count of every place by name, after each step of a run. */
type Run = {
  /** How the run ended. */
  completion: string | null;
  /** The last step that fired a transition. */
  steps: number;
  /** One record per position: the initial state, then every step. */
  counts: Record<string, number>[];
};

/** Runs a scenario of an untimed net step by step, to its end. */
const run = (
  sdcpn: SDCPN,
  scenarioId: string,
  seed: number,
  scenarioParameterValues?: Record<string, number>,
): Run => {
  const scenario = sdcpn.scenarios!.find(({ id }) => id === scenarioId)!;
  const compiled = compileScenario(
    scenario,
    lowerScenarioToHir(scenario, {
      adHocContext: {
        places: sdcpn.places,
        types: sdcpn.types,
        netParameters: sdcpn.parameters,
      },
    }),
    sdcpn.parameters,
    sdcpn.places,
    sdcpn.types,
    scenarioParameterValues ? { scenarioParameterValues } : undefined,
  );
  if (!compiled.ok) {
    throw new Error(compiled.errors.map((error) => error.message).join("; "));
  }

  const stepper = createStepStepper({
    sdcpn,
    hirArtifacts: compileHirArtifacts(sdcpn).artifacts,
    initialMarking: compiled.result.initialState,
    parameterValues: compiled.result.parameterValues,
    seed,
    maxTime: null,
  });
  const recorder = createTraceRecorder(stepper);
  const layout = createEngineFrameLayout(sdcpn);
  const countsOf = (frame: ArrayBuffer): Record<string, number> => {
    const { placeCounts } = readEngineFrame(layout, frame);
    return Object.fromEntries(
      sdcpn.places.map((place, index) => [place.name, placeCounts[index]!]),
    );
  };

  const counts = [countsOf(recorder.initialEvent.frame)];
  for (let advance = 0; advance < 500; advance++) {
    const recording = recorder.next();
    if (recording.event) {
      counts.push(countsOf(recording.event.frame));
    }
    if (recording.error !== null) {
      throw new Error(recording.error);
    }
    if (recording.completion !== null) {
      return {
        completion: recording.completion,
        steps: recording.time,
        counts,
      };
    }
  }
  throw new Error("the run did not end within 500 advances");
};

describe("Bicycle Assembly", () => {
  const { petriNetDefinition } = bicycleAssembly;

  it("is an untimed net", () => {
    expect(isTimedNet(petriNetDefinition)).toBe(false);
  });

  it("builds four bicycles from the Morning Stock in ten steps, and shows what is left", () => {
    const morning = run(petriNetDefinition, "scenario__morning_stock", 1);

    expect(morning.completion).toBe("deadlock");
    expect(morning.steps).toBe(10);
    expect(morning.counts.at(-1)).toEqual({
      Rims: 1,
      Tyres: 0,
      Wheels: 1,
      Frames: 0,
      // The fifth frame took a stand and waits for a wheel that never comes.
      FreeStands: 1,
      OnStand: 1,
      Rolling: 0,
      Saddles: 0,
      Bicycles: 4,
    });
    // A wheel a step, two wheels a bicycle: one bicycle every other step.
    expect(morning.counts.map((count) => count.Bicycles)).toEqual([
      0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4,
    ]);
  });

  it("is the same run whatever the seed", () => {
    expect(run(petriNetDefinition, "scenario__morning_stock", 7)).toEqual(
      run(petriNetDefinition, "scenario__morning_stock", 1),
    );
  });

  it("builds the same four bicycles on one workstand, in fourteen steps", () => {
    const oneStand = run(petriNetDefinition, "scenario__one_stand", 1);

    expect(oneStand.completion).toBe("deadlock");
    expect(oneStand.steps).toBe(14);
    expect(oneStand.counts.at(-1)).toMatchObject({
      Bicycles: 4,
      FreeStands: 0,
      OnStand: 1,
    });
  });

  it("builds a fifth bicycle only once the wheel it lacks can be built", () => {
    const stock = { rims: 10, tyres: 9, frames: 5, saddles: 5, stands: 2 };
    const bicycles = (values: typeof stock) =>
      run(petriNetDefinition, "scenario__morning_stock", 1, values).counts.at(
        -1,
      )!.Bicycles;

    // One more saddle changes nothing: the fifth frame is a wheel short.
    expect(bicycles(stock)).toBe(4);
    expect(bicycles({ ...stock, tyres: 10 })).toBe(5);
  });
});

describe("Wheel Truing", () => {
  const { petriNetDefinition } = wheelTruing;

  it("is an untimed net", () => {
    expect(isTimedNet(petriNetDefinition)).toBe(false);
  });

  it("runs every wheel of the batch to Accepted or Rejected", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const batch = run(petriNetDefinition, "scenario__batch_of_six", seed);

      expect(batch.completion).toBe("deadlock");
      expect(batch.counts.at(-1)).toMatchObject({ Laced: 0, Measured: 0 });
      const last = batch.counts.at(-1)!;
      expect(last.Accepted! + last.Rejected!).toBe(6);
      // The stand takes one wheel per step, and no wheel more than four
      // passes: six wheels are done within 24 passes and the step that
      // sorts the last one.
      expect(batch.steps).toBeGreaterThanOrEqual(7);
      expect(batch.steps).toBeLessThanOrEqual(25);
    }
  });

  it("draws a different run for a different seed", () => {
    const runs = [1, 2, 3, 4, 5].map((seed) =>
      JSON.stringify(
        run(petriNetDefinition, "scenario__batch_of_six", seed).counts,
      ),
    );
    expect(new Set(runs).size).toBeGreaterThan(1);
  });

  it("accepts fewer wheels at a tighter tolerance", () => {
    const accepted = (scenarioId: string) =>
      Array.from({ length: 40 }, (_, seed) =>
        run(petriNetDefinition, scenarioId, seed + 1).counts.at(-1)!,
      ).reduce((sum, last) => sum + last.Accepted!, 0);

    expect(accepted("scenario__tight_tolerance")).toBeLessThan(
      accepted("scenario__batch_of_six"),
    );
  });
});
