import { describe, expect, it } from "vitest";

import { sirModel } from "../../../examples";
import { compileHirArtifacts } from "../../../hir/compile";
import { createMonteCarloSimulator } from "../../monte-carlo/monte-carlo-simulator";
import { ADAPTIVE_SIMULATOR_ID } from "./adaptive-stepper";
import { FIXED_STEP_SIMULATOR_ID } from "./fixed-step-stepper";
import { createStepperRunDriverFactory } from "./stepper-run-driver";

import type { SDCPN } from "../../../types/sdcpn";
import type { SimulationFrameReader } from "../../api";
import type { MonteCarloFrameMetric } from "../../monte-carlo/metrics/types";
import type { StepperSelection } from "./steppers";

const sir = sirModel.petriNetDefinition;
const sirConfig = {
  sdcpn: sir,
  hirArtifacts: compileHirArtifacts(sir).artifacts,
  initialMarking: Object.fromEntries(
    sir.places.map((place, index) => [place.id, index === 0 ? 50 : 3]),
  ),
  parameterValues: {},
  seed: 9,
  maxTime: 3,
  runCount: 6,
};

/** A source firing at rate 5 into `sink`. */
const poisson: SDCPN = {
  places: [
    {
      id: "sink",
      name: "Sink",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
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

/**
 * An untimed net. `move` drains `source` into `sink`. `never` keeps its
 * token, and its guard never holds.
 */
const drain: SDCPN = {
  places: ["source", "sink", "hold"].map((id) => ({
    id,
    name: id,
    colorId: null,
    dynamicsEnabled: false,
    x: 0,
    y: 0,
  })),
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

/** What every run's frame reads at each sample, as a metric is shown it. */
const readingsOf = <Reading>(
  read: (frame: SimulationFrameReader) => Reading,
) => {
  const samples: Reading[][] = [];
  const metric: MonteCarloFrameMetric = {
    observeFrame: ({ forEachRunFrame }) => {
      const sample: Reading[] = [];
      forEachRunFrame(({ frame }) => sample.push(read(frame)));
      samples.push(sample);
    },
  };
  return { metric, samples };
};

const adaptivePoisson = (metric: MonteCarloFrameMetric, runCount: number) =>
  createMonteCarloSimulator({
    sdcpn: poisson,
    hirArtifacts: compileHirArtifacts(poisson).artifacts,
    initialMarking: { sink: 0 },
    parameterValues: {},
    seed: 4,
    dt: 0.25,
    maxTime: 2,
    runCount,
    metrics: [metric],
    createRunDriver: createStepperRunDriverFactory({
      id: ADAPTIVE_SIMULATOR_ID,
      parameters: { tolerance: 1e-6 },
    }),
  });

describe("an experiment whose runs a stepper advances", () => {
  it("is the experiment the fixed-step engine computes, when the stepper is that engine's", () => {
    const dt = 0.05;
    const engine = createMonteCarloSimulator({ ...sirConfig, dt });
    const driven = createMonteCarloSimulator({
      ...sirConfig,
      dt,
      createRunDriver: createStepperRunDriverFactory({
        id: FIXED_STEP_SIMULATOR_ID,
        parameters: { dt },
      }),
    });

    for (let sample = 1; ; sample++) {
      const expected = engine.advanceAll();
      const actual = driven.advanceAll();
      expect(actual).toEqual(expected);
      for (let run = 0; run < sirConfig.runCount; run++) {
        const expectedRun = engine.getRunSnapshot(run);
        const actualRun = driven.getRunSnapshot(run);
        expect(actualRun.placeTokenCounts).toEqual(
          expectedRun.placeTokenCounts,
        );
        expect(actualRun.rngState).toBe(expectedRun.rngState);
        expect(actualRun.status).toBe(expectedRun.status);
      }
      if (expected.allFinished) {
        expect(sample).toBe(60);
        break;
      }
    }
  });

  it("samples a coarser grid than the stepper's step without changing the runs", () => {
    const fine = createMonteCarloSimulator({ ...sirConfig, dt: 0.05 });
    const coarse = createMonteCarloSimulator({
      ...sirConfig,
      // Sampled every 0.5 s, stepped every 0.05 s.
      dt: 0.5,
      createRunDriver: createStepperRunDriverFactory({
        id: FIXED_STEP_SIMULATOR_ID,
        parameters: { dt: 0.05 },
      }),
    });

    for (let sample = 1; sample <= 6; sample++) {
      for (let step = 0; step < 10; step++) {
        fine.advanceAll();
      }
      const result = coarse.advanceAll();
      for (let run = 0; run < sirConfig.runCount; run++) {
        expect(coarse.getRunSnapshot(run).placeTokenCounts).toEqual(
          fine.getRunSnapshot(run).placeTokenCounts,
        );
      }
      expect(result.allFinished).toBe(sample === 6);
    }
  });

  it("computes the adaptive simulator's runs to every sample time, the same way each time", () => {
    const create = () =>
      createMonteCarloSimulator({
        sdcpn: poisson,
        hirArtifacts: compileHirArtifacts(poisson).artifacts,
        initialMarking: { sink: 0 },
        parameterValues: {},
        seed: 4,
        dt: 0.25,
        maxTime: 2,
        runCount: 200,
        createRunDriver: createStepperRunDriverFactory({
          id: ADAPTIVE_SIMULATOR_ID,
          parameters: { tolerance: 1e-6 },
        }),
      });
    const counts = (simulator: ReturnType<typeof create>) =>
      Array.from(
        { length: 200 },
        (_, run) => simulator.getRunSnapshot(run).placeTokenCounts.sink ?? 0,
      );

    const first = create();
    const second = create();
    for (let sample = 1; sample <= 8; sample++) {
      const result = first.advanceAll();
      second.advanceAll();
      const arrived = counts(first);
      // The same stops give the same draws, so the same runs.
      expect(counts(second)).toEqual(arrived);
      // Arrivals at rate 5: a mean of 5t, within what 200 runs scatter.
      const mean = arrived.reduce((sum, count) => sum + count, 0) / 200;
      const expectedMean = 5 * sample * 0.25;
      expect(Math.abs(mean - expectedMean)).toBeLessThan(
        4 * Math.sqrt(expectedMean / 200),
      );
      expect(result.allFinished).toBe(sample === 8);
    }
    expect(first.getRunSummary(0).completionReason).toBe("maxTime");
  });

  it("gives a worker's runs their own positions and the experiment's seeds", () => {
    const createRunDriver = createStepperRunDriverFactory({
      id: FIXED_STEP_SIMULATOR_ID,
      parameters: { dt: 0.05 },
    });
    const whole = createMonteCarloSimulator({
      ...sirConfig,
      dt: 0.05,
      createRunDriver,
    });
    // The last two of the six runs, as a second worker would be dealt them.
    const shard = createMonteCarloSimulator({
      ...sirConfig,
      dt: 0.05,
      runCount: 2,
      runIndexOffset: 4,
      createRunDriver,
    });

    const shardRuns = shard.getSummaries();
    // Metrics index their per-run storage by this position.
    expect(shardRuns.map((run) => run.index)).toEqual([0, 1]);
    expect(shardRuns.map((run) => run.seed)).toEqual(
      whole
        .getSummaries()
        .slice(4)
        .map((run) => run.seed),
    );
  });

  it("reports the time an adaptive run has reached", () => {
    const simulator = createMonteCarloSimulator({
      sdcpn: poisson,
      hirArtifacts: compileHirArtifacts(poisson).artifacts,
      initialMarking: { sink: 0 },
      parameterValues: {},
      seed: 4,
      dt: 0.25,
      maxTime: 2,
      runCount: 3,
      createRunDriver: createStepperRunDriverFactory({
        id: ADAPTIVE_SIMULATOR_ID,
        parameters: { tolerance: 1e-6 },
      }),
    });
    simulator.advanceAll();
    simulator.advanceAll();
    expect(simulator.getRunSummary(0)).toMatchObject({
      frameNumber: 2,
      currentTime: 0.5,
    });
    expect(simulator.getRunSnapshot(2)).toMatchObject({
      frameNumber: 2,
      currentTime: 0.5,
    });
  });

  it("shows a metric the sample and the time an adaptive run has reached", () => {
    const { metric, samples } = readingsOf((frame) => ({
      number: frame.number,
      time: frame.time,
      stateNumber: frame.toFrameState().number,
    }));
    const simulator = adaptivePoisson(metric, 2);
    simulator.advanceAll();
    simulator.advanceAll();

    expect(samples).toEqual(
      [0, 1, 2].map((sample) =>
        Array.from({ length: 2 }, () => ({
          number: sample,
          time: sample * 0.25,
          stateNumber: sample,
        })),
      ),
    );
  });

  it("shows a metric the transitions that fired since the sample before", () => {
    const { metric, samples } = readingsOf((frame) => {
      const state = frame.getTransitionState("arrive")!;
      return { fired: state.firedInThisFrame, count: state.firingCount };
    });
    const simulator = adaptivePoisson(metric, 20);
    simulator.runUntilComplete();

    expect(samples).toHaveLength(9);
    for (const [sample, runs] of samples.entries()) {
      for (const [run, { fired, count }] of runs.entries()) {
        const before = sample === 0 ? 0 : samples[sample - 1]![run]!.count;
        expect(fired).toBe(count > before);
      }
    }
    // Arrivals at rate 5 leave few quarter seconds without one.
    expect(samples.flat().filter(({ fired }) => fired).length).toBeGreaterThan(
      80,
    );
  });

  it("times the last sample at the end time when the run stops between two samples", () => {
    const sampleTimes = (driven: boolean) => {
      const times: number[] = [];
      const simulator = createMonteCarloSimulator({
        sdcpn: poisson,
        hirArtifacts: compileHirArtifacts(poisson).artifacts,
        initialMarking: { sink: 0 },
        parameterValues: {},
        seed: 4,
        dt: 0.1,
        maxTime: 0.25,
        runCount: 2,
        metrics: [{ observeFrame: ({ time }) => times.push(time) }],
        ...(driven
          ? {
              createRunDriver: createStepperRunDriverFactory({
                id: ADAPTIVE_SIMULATOR_ID,
                parameters: { tolerance: 1e-6 },
              }),
            }
          : {}),
      });
      simulator.runUntilComplete();
      expect(simulator.getRunSummary(0).completionReason).toBe("maxTime");
      return times.map((time) => Number(time.toFixed(9)));
    };

    // An adaptive run stops at the end time itself.
    expect(sampleTimes(true)).toEqual([0, 0.1, 0.2, 0.25]);
    // The fixed-step engine takes whole steps, and its last one passes it.
    expect(sampleTimes(false)).toEqual([0, 0.1, 0.2, 0.3]);
  });

  // The fourth step fires nothing. A run told to stop at it ends as one
  // told to stop later does.
  it.each([10, 4])(
    "steps an untimed net to step %i as the engine does at a step of one, whichever simulator is selected",
    (maxTime) => {
      const sinkPerStep = (
        createRunDriver?: ReturnType<typeof createStepperRunDriverFactory>,
      ) => {
        const { metric, samples } = readingsOf((frame) =>
          frame.getPlaceTokenCount("sink"),
        );
        const simulator = createMonteCarloSimulator({
          sdcpn: drain,
          hirArtifacts: compileHirArtifacts(drain).artifacts,
          initialMarking: { source: 3, sink: 0, hold: 1 },
          parameterValues: {},
          seed: 4,
          // A sample per step.
          dt: 1,
          maxTime,
          runCount: 2,
          metrics: [metric],
          ...(createRunDriver ? { createRunDriver } : {}),
        });
        simulator.runUntilComplete();
        return {
          samples,
          ends: simulator
            .getSummaries()
            .map(({ status, completionReason }) => [status, completionReason]),
        };
      };

      const engine = sinkPerStep();
      // Three steps move the tokens. The fourth fires nothing and ends the
      // run, though `never` still has its token.
      expect(engine.samples).toEqual([
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3],
        [3, 3],
      ]);
      expect(engine.ends).toEqual([
        ["complete", "deadlock"],
        ["complete", "deadlock"],
      ]);

      // Neither simulator's own stepper is used: the adaptive one would
      // compute the whole run at time 0, and the fixed-step one would take a
      // hundred steps per sample.
      const selections: StepperSelection[] = [
        { id: ADAPTIVE_SIMULATOR_ID, parameters: { tolerance: 1e-6 } },
        { id: FIXED_STEP_SIMULATOR_ID, parameters: { dt: 0.01 } },
      ];
      for (const selection of selections) {
        expect(sinkPerStep(createStepperRunDriverFactory(selection))).toEqual(
          engine,
        );
      }
    },
  );
});
