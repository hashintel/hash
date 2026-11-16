import { describe, expect, it } from "vitest";

import { compileHirArtifacts } from "../hir";
import { lowerScenarioToHir } from "../hir/scenario";
import { buildVisualizerContext } from "../hir/surface-context";
import { netTimeOf } from "../net-class";
import { PETRINAUT_DEFAULT_SEED } from "../simulation/api";
import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import { createStepStepper } from "../simulation/event-trace/worker/step-stepper";
import { createTraceRecorder } from "../simulation/event-trace/worker/trace-recorder";
import {
  createEngineFrameLayout,
  readEngineFrame,
} from "../simulation/frames/internal-frame";
import { interpretViewHir, ViewElementValue } from "../view-hir/interpret-view";
import { lowerVisualizerToHir } from "../view-hir/visualizer";
import { bicycleAssembly } from "./bicycle-assembly";
import { wheelTruing } from "./wheel-truing";

import type { SDCPN } from "../types/sdcpn";
import type { ViewValue } from "../view-hir/interpret-view";

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
    expect(netTimeOf(petriNetDefinition)).toBe("untimed");
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
    expect(netTimeOf(petriNetDefinition)).toBe("untimed");
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

  it("replays the same batch in a Quick simulation, which always takes the default seed", () => {
    const batch = run(
      petriNetDefinition,
      "scenario__batch_of_six",
      PETRINAUT_DEFAULT_SEED,
    );

    expect(batch.steps).toBe(22);
    expect(batch.counts.at(-1)).toMatchObject({ Accepted: 3, Rejected: 3 });
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

describe("Wheel Truing visualizers", () => {
  const { petriNetDefinition } = wheelTruing;
  type Wheel = { runout: number; passes: number };

  /** What the visualizer of a place draws for its tokens. */
  const draw = (placeName: string, tokens: Wheel[]): ViewValue => {
    const place = petriNetDefinition.places.find(
      ({ name }) => name === placeName,
    )!;
    const lowered = lowerVisualizerToHir(
      place.visualizerCode!,
      buildVisualizerContext(petriNetDefinition, place),
    );
    if (!lowered.ok) {
      throw new Error(lowered.diagnostics.map((item) => item.message).join());
    }
    return interpretViewHir(lowered.view, {
      tokens,
      width: 360,
      height: 240,
      parameters: {
        tolerance: 0.5,
        max_passes: 4,
        correction: 0.45,
        spread: 0.25,
      },
    });
  };

  /** Every element of a drawing, the root first. */
  const elementsOf = (value: ViewValue): ViewElementValue[] =>
    Array.isArray(value)
      ? (value as readonly ViewValue[]).flatMap(elementsOf)
      : value instanceof ViewElementValue
        ? [value, ...value.children.flatMap(elementsOf)]
        : [];

  /** The words of a drawing, one string per text element. */
  const wordsOf = (value: ViewValue): string[] => {
    const read = (child: ViewValue): string =>
      Array.isArray(child)
        ? (child as readonly ViewValue[]).map(read).join("")
        : child instanceof ViewElementValue
          ? child.children.map(read).join("")
          : typeof child === "string" || typeof child === "number"
            ? String(child)
            : "";
    return elementsOf(value)
      .filter((element) => element.tag === "text")
      .map(read);
  };

  it("gives every place a visualizer", () => {
    expect(
      petriNetDefinition.places.map((place) => [
        place.name,
        place.visualizerCode !== undefined,
      ]),
    ).toEqual([
      ["Laced", true],
      ["Measured", true],
      ["Accepted", true],
      ["Rejected", true],
    ]);
  });

  it("names on the gauge the transition whose predicate holds for the wheel", () => {
    // Within tolerance, whatever the passes.
    expect(wordsOf(draw("Measured", [{ runout: 0.38, passes: 4 }]))).toContain(
      "Accept",
    );
    // Still out, with a pass left.
    expect(wordsOf(draw("Measured", [{ runout: 1.62, passes: 1 }]))).toContain(
      "Retrue",
    );
    // Still out after the last pass.
    expect(wordsOf(draw("Measured", [{ runout: 0.92, passes: 4 }]))).toContain(
      "Reject",
    );
    expect(wordsOf(draw("Measured", []))).toContain("Stand free");
  });

  it("puts a rim off its hub by the wheel's runout, and on it at none", () => {
    /** The widest gap between the hub and the centre of a rim, per wheel. */
    const offCentre = (wheel: Wheel): number => {
      const circles = elementsOf(draw("Accepted", [wheel])).filter(
        (element) => element.tag === "circle",
      );
      const [ring, rim] = circles.map((circle) => [
        Number(circle.attributes.get("cx")),
        Number(circle.attributes.get("cy")),
      ]);
      return Math.hypot(rim![0]! - ring![0]!, rim![1]! - ring![1]!);
    };

    expect(offCentre({ runout: 0, passes: 1 })).toBe(0);
    expect(offCentre({ runout: 0.4, passes: 1 })).toBeGreaterThan(0);
    expect(offCentre({ runout: 2, passes: 1 })).toBeCloseTo(
      5 * offCentre({ runout: 0.4, passes: 1 }),
    );
  });

  it("draws one wheel per token, and marks the head of the queue alone", () => {
    const wheels = [
      { runout: 3, passes: 0 },
      { runout: 1.2, passes: 1 },
      { runout: 0.7, passes: 2 },
    ];
    const millimetres = (placeName: string) =>
      wordsOf(draw(placeName, wheels)).filter((words) => words.endsWith("mm"));

    expect(millimetres("Laced")).toEqual(["3.00 mm", "1.20 mm", "0.70 mm"]);
    expect(
      wordsOf(draw("Laced", wheels)).filter((words) => words === "NEXT"),
    ).toHaveLength(1);
    expect(wordsOf(draw("Rejected", wheels))).not.toContain("NEXT");
    expect(wordsOf(draw("Rejected", wheels))).toContain(
      "3 rejected · worst 3.00 mm",
    );
    expect(wordsOf(draw("Accepted", wheels))).toContain(
      "3 accepted · 1.0 passes each",
    );
    expect(wordsOf(draw("Laced", []))).toContain("No wheel is waiting");
  });
});
