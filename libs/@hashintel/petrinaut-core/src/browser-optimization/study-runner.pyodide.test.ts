/**
 * Runs the real Optuna study under Pyodide in Node. The Pyodide runtime comes
 * from the `pyodide` devDependency; its packages and the PyPI wheels download
 * from the CDN on the first run (Pyodide caches the distribution packages
 * next to the runtime). When `CI` is set and that download fails, the tests
 * skip instead of failing, so an offline CI runner does not turn a network
 * outage into a red build. Every other load failure, a Python syntax or
 * import error included, fails the suite.
 */
import { loadPyodide } from "pyodide";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { defaultOptimizerPyodideConfig } from "./pyodide-config";
import { optimizerPythonSources } from "./python-sources";
import {
  createOptimizerStudyRunner,
  type OptimizerStudyCallbacks,
  type OptimizerStudyRunner,
} from "./study-runner";

import type {
  OptimizationScalar,
  PetrinautOptimizationDescribeResult,
  PetrinautOptimizationTrialOutcome,
} from "../optimization";
import type { OptimizerTrialPayload } from "./messages";

declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
};
declare const setTimeout: (handler: () => void, timeout?: number) => unknown;

const loadTimeout = 180_000;
const runningInCi = (process.env.CI ?? "") !== "";

const downloadFailurePattern =
  /fetch|network|request failed|ENOTFOUND|ECONN|EAI_AGAIN|timed out|Can't fetch/i;

const isDownloadFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (downloadFailurePattern.test(error.message) ||
    (error.cause instanceof Error &&
      downloadFailurePattern.test(error.cause.message)));

const description: PetrinautOptimizationDescribeResult = {
  direction: "minimize",
  study: { trials: 30, sampler: "tpe", seed: 7, seedsPerTrial: 1 },
  parameters: [
    {
      identifier: "rate",
      type: "float",
      default: 1,
      minimum: 0.1,
      maximum: 10,
      scale: "log",
    },
    {
      identifier: "offset",
      type: "float",
      default: 0,
      minimum: -5,
      maximum: 5,
      scale: "linear",
    },
    {
      identifier: "count",
      type: "int",
      default: 4,
      minimum: 2,
      maximum: 20,
      step: 2,
      scale: "linear",
    },
    { identifier: "enabled", type: "boolean", default: false },
  ],
};

const withTrials = (trials: number): PetrinautOptimizationDescribeResult => ({
  ...description,
  study: { ...description.study, trials },
});

const asNumber = (value: OptimizationScalar | undefined): number => {
  if (typeof value !== "number") {
    throw new Error(`expected a number, received ${String(value)}`);
  }
  return value;
};

const objectiveOf = (values: Record<string, OptimizationScalar>): number =>
  (Math.log(asNumber(values.rate)) - Math.log(2)) ** 2 +
  (asNumber(values.offset) - 1) ** 2 +
  (asNumber(values.count) - 8) ** 2 / 16 +
  (values.enabled === true ? 0 : 1);

/** Callbacks that record what the study asked and reported. */
const recorder = (options?: {
  evaluate?: (
    trial: number,
    suggestedValues: Record<string, OptimizationScalar>,
  ) => Promise<PetrinautOptimizationTrialOutcome>;
  isCancelled?: () => boolean;
}) => {
  const evaluated: Record<string, OptimizationScalar>[] = [];
  const trialNumbers: number[] = [];
  const trials: OptimizerTrialPayload[] = [];
  const started: number[] = [];
  const callbacks: OptimizerStudyCallbacks = {
    onStarted: (requestedTrials) => {
      started.push(requestedTrials);
    },
    evaluate: async (trial, suggestedValues) => {
      trialNumbers.push(trial);
      evaluated.push(suggestedValues);
      return options?.evaluate
        ? options.evaluate(trial, suggestedValues)
        : { kind: "objective", objective: objectiveOf(suggestedValues) };
    },
    onTrial: (event) => {
      trials.push(event);
    },
    isCancelled: options?.isCancelled ?? (() => false),
  };
  return { evaluated, trialNumbers, trials, started, callbacks };
};

let runner: OptimizerStudyRunner;
let loadFailure: string | null = null;

beforeAll(async () => {
  runner = createOptimizerStudyRunner({
    // The runtime itself comes from node_modules; only the packages download.
    loadPyodide: () => loadPyodide(),
    config: defaultOptimizerPyodideConfig(),
    pythonSources: optimizerPythonSources,
  });
  try {
    await runner.ready;
  } catch (error) {
    if (!runningInCi || !isDownloadFailure(error)) {
      throw error;
    }
    loadFailure = error instanceof Error ? error.message : String(error);
  }
}, loadTimeout);

afterAll(async () => {
  if (loadFailure === null) {
    await runner.dispose();
  }
});

const skipWhenOffline = (skip: (note?: string) => never): void => {
  if (loadFailure !== null) {
    skip(`Pyodide packages could not be downloaded in CI: ${loadFailure}`);
  }
};

describe("createOptimizerStudyRunner", () => {
  test(
    "drives a seeded TPE study through the host evaluate callback",
    async ({ skip }) => {
      skipWhenOffline(skip);
      const run = recorder({
        evaluate: async (trial, suggestedValues) =>
          trial === 3
            ? { kind: "pruned", reason: "no frames" }
            : { kind: "objective", objective: objectiveOf(suggestedValues) },
      });

      const summary = await runner.start({
        runId: "seeded",
        description,
        parallelism: 1,
        callbacks: run.callbacks,
      });

      expect(run.started).toEqual([30]);
      expect(run.trialNumbers).toEqual(
        Array.from({ length: 30 }, (_, index) => index),
      );
      for (const values of run.evaluated) {
        expect(Object.keys(values).sort()).toEqual([
          "count",
          "enabled",
          "offset",
          "rate",
        ]);
        expect(asNumber(values.rate)).toBeGreaterThanOrEqual(0.1);
        expect(asNumber(values.rate)).toBeLessThanOrEqual(10);
        expect(asNumber(values.offset)).toBeGreaterThanOrEqual(-5);
        expect(asNumber(values.offset)).toBeLessThanOrEqual(5);
        expect(asNumber(values.count) % 2).toBe(0);
        expect(asNumber(values.count)).toBeGreaterThanOrEqual(2);
        expect(asNumber(values.count)).toBeLessThanOrEqual(20);
        expect(typeof values.enabled).toBe("boolean");
      }

      expect(run.trials.map((event) => event.trial)).toEqual(
        Array.from({ length: 30 }, (_, index) => index),
      );
      let bestSoFar = Number.POSITIVE_INFINITY;
      for (const [index, event] of run.trials.entries()) {
        expect(event.parameters).toEqual(run.evaluated[index]);
        if (index === 3) {
          expect(event.state).toBe("pruned");
          expect(event.objective).toBeNull();
        } else {
          expect(event.state).toBe("complete");
          expect(event.objective).toBeCloseTo(objectiveOf(event.parameters), 9);
          bestSoFar = Math.min(bestSoFar, event.objective ?? Infinity);
        }
        if (index === 0) {
          expect(event.best).toEqual({
            trial: 0,
            parameters: event.parameters,
            objective: event.objective,
          });
        }
        expect(event.best?.objective).toBeCloseTo(bestSoFar, 9);
      }

      expect(summary).toEqual({
        requestedTrials: 30,
        completedTrials: 29,
        prunedTrials: 1,
        failedTrials: 0,
        best: run.trials.at(-1)?.best,
      });
    },
    loadTimeout,
  );

  test(
    "continues a study on the same sampler history, numbering onwards",
    async ({ skip }) => {
      skipWhenOffline(skip);
      const split = async (runId: string) => {
        const first = recorder();
        await runner.start({
          runId,
          description: withTrials(8),
          parallelism: 1,
          callbacks: first.callbacks,
        });
        const second = recorder();
        const summary = await runner.extend({
          runId,
          trials: 8,
          parallelism: 1,
          callbacks: second.callbacks,
        });
        return { first, second, summary };
      };
      const study = await split("split");
      const again = await split("split-again");

      // A seeded restart repeats the first segment exactly, so a second
      // segment that differs from the first proves the extension sampled
      // from the history the first segment left instead of restarting.
      expect(again.first.evaluated).toEqual(study.first.evaluated);
      expect(again.second.evaluated).toEqual(study.second.evaluated);
      expect(study.second.evaluated).not.toEqual(study.first.evaluated);
      expect(study.first.started).toEqual([8]);
      expect(study.second.started).toEqual([16]);
      expect(study.second.trialNumbers).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
      expect(study.second.trials.map((event) => event.trial)).toEqual(
        study.second.trialNumbers,
      );
      expect(study.summary).toMatchObject({
        requestedTrials: 16,
        completedTrials: 16,
        prunedTrials: 0,
      });
      expect(study.summary.best).toEqual(study.second.trials.at(-1)?.best);
    },
    loadTimeout,
  );

  test(
    "stops early once the host reports cancellation and resumes from the trials told",
    async ({ skip }) => {
      skipWhenOffline(skip);
      const run = recorder({ isCancelled: () => run.trialNumbers.length >= 5 });

      const stopped = await runner.start({
        runId: "stopped",
        description,
        parallelism: 1,
        callbacks: run.callbacks,
      });

      expect(run.trialNumbers).toHaveLength(5);
      expect(run.trials).toHaveLength(4);
      // The trial in flight at the stop is told as failed so Optuna keeps no
      // running trial behind; the count carries into the resumed summary.
      expect(stopped).toMatchObject({
        requestedTrials: 30,
        completedTrials: 4,
        failedTrials: 1,
        cancelled: true,
      });

      const resumed = recorder();
      const summary = await runner.extend({
        runId: "stopped",
        trials: 2,
        parallelism: 1,
        callbacks: resumed.callbacks,
      });

      expect(resumed.started).toEqual([6]);
      expect(resumed.trialNumbers).toEqual([5, 6]);
      expect(resumed.trials.map((event) => event.trial)).toEqual([5, 6]);
      expect(summary).toEqual({
        requestedTrials: 6,
        completedTrials: 6,
        prunedTrials: 0,
        failedTrials: 1,
        best: resumed.trials.at(-1)?.best,
      });
    },
    loadTimeout,
  );

  test(
    "keeps up to the parallelism in flight and tells outcomes as they settle",
    async ({ skip }) => {
      skipWhenOffline(skip);
      let inFlight = 0;
      let mostInFlight = 0;
      const run = recorder({
        evaluate: async (trial, suggestedValues) => {
          inFlight += 1;
          mostInFlight = Math.max(mostInFlight, inFlight);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, trial % 2 === 0 ? 30 : 1);
          });
          inFlight -= 1;
          return { kind: "objective", objective: objectiveOf(suggestedValues) };
        },
      });

      const summary = await runner.start({
        runId: "parallel",
        description: withTrials(6),
        parallelism: 2,
        callbacks: run.callbacks,
      });

      expect(mostInFlight).toBe(2);
      expect(run.trialNumbers).toEqual([0, 1, 2, 3, 4, 5]);
      expect(
        run.trials
          .map((event) => event.trial)
          .sort((left, right) => left - right),
      ).toEqual([0, 1, 2, 3, 4, 5]);
      for (const event of run.trials) {
        expect(event.parameters).toEqual(run.evaluated[event.trial]);
        expect(event.objective).toBeCloseTo(objectiveOf(event.parameters), 9);
      }
      expect(summary).toMatchObject({
        requestedTrials: 6,
        completedTrials: 6,
        prunedTrials: 0,
      });
    },
    loadTimeout,
  );

  test(
    "drops a released study, and one whose segment failed",
    async ({ skip }) => {
      skipWhenOffline(skip);
      await runner.start({
        runId: "released",
        description: withTrials(2),
        parallelism: 1,
        callbacks: recorder().callbacks,
      });
      await runner.release("released");
      await runner.release("never-started");

      await expect(
        runner.extend({
          runId: "released",
          trials: 1,
          parallelism: 1,
          callbacks: recorder().callbacks,
        }),
      ).rejects.toThrow('Optimization study "released" is not kept');

      await expect(
        runner.start({
          runId: "failing",
          description,
          parallelism: 1,
          callbacks: recorder({
            evaluate: async () => ({
              kind: "objective",
              objective: Number.NaN,
            }),
          }).callbacks,
        }),
      ).rejects.toThrow("trial objective must be a finite number");
      await expect(
        runner.extend({
          runId: "failing",
          trials: 1,
          parallelism: 1,
          callbacks: recorder().callbacks,
        }),
      ).rejects.toThrow('Optimization study "failing" is not kept');
    },
    loadTimeout,
  );

  test(
    "samples deterministically for a seed",
    async ({ skip }) => {
      skipWhenOffline(skip);
      const sequences: Record<string, OptimizationScalar>[][] = [];
      for (let repeat = 0; repeat < 2; repeat++) {
        const run = recorder();
        await runner.start({
          runId: `repeat-${repeat}`,
          description: withTrials(8),
          parallelism: 1,
          callbacks: run.callbacks,
        });
        sequences.push(run.evaluated);
      }
      expect(sequences[0]).toEqual(sequences[1]);
    },
    loadTimeout,
  );
});
