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
import { beforeAll, describe, expect, test } from "vitest";

import { defaultOptimizerPyodideConfig } from "./pyodide-config";
import { optimizerPythonSources } from "./python-sources";
import {
  createOptimizerStudyRunner,
  type OptimizerStudyRunner,
} from "./study-runner";

import type {
  OptimizationScalar,
  PetrinautOptimizationDescribeResult,
} from "../optimization";
import type { OptimizerTrialPayload } from "./messages";

declare const process: {
  readonly env: Readonly<Record<string, string | undefined>>;
};

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
      const trials: OptimizerTrialPayload[] = [];
      const evaluated: Record<string, OptimizationScalar>[] = [];

      const summary = await runner.run({
        description,
        evaluate: async (trial, suggestedValues) => {
          expect(trial).toBe(evaluated.length);
          evaluated.push(suggestedValues);
          return trial === 3
            ? { kind: "pruned", reason: "no frames" }
            : { kind: "objective", objective: objectiveOf(suggestedValues) };
        },
        onTrial: (event) => {
          trials.push(event);
        },
        isCancelled: () => false,
      });

      expect(evaluated).toHaveLength(30);
      for (const values of evaluated) {
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

      expect(trials.map((event) => event.trial)).toEqual(
        Array.from({ length: 30 }, (_, index) => index),
      );
      let bestSoFar = Number.POSITIVE_INFINITY;
      for (const [index, event] of trials.entries()) {
        expect(event.parameters).toEqual(evaluated[index]);
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
        best: trials.at(-1)?.best,
      });
    },
    loadTimeout,
  );

  test(
    "stops early once the host reports cancellation",
    async ({ skip }) => {
      skipWhenOffline(skip);
      let evaluations = 0;
      const trials: OptimizerTrialPayload[] = [];

      const summary = await runner.run({
        description,
        evaluate: async (_trial, suggestedValues) => {
          evaluations += 1;
          return { kind: "objective", objective: objectiveOf(suggestedValues) };
        },
        onTrial: (event) => {
          trials.push(event);
        },
        isCancelled: () => evaluations >= 5,
      });

      expect(evaluations).toBe(5);
      expect(trials).toHaveLength(4);
      expect(summary).toMatchObject({
        requestedTrials: 30,
        completedTrials: 4,
        cancelled: true,
      });
    },
    loadTimeout,
  );

  test(
    "samples deterministically for a seed and rejects a non-finite objective",
    async ({ skip }) => {
      skipWhenOffline(skip);
      const sequences: Record<string, OptimizationScalar>[][] = [];
      for (let repeat = 0; repeat < 2; repeat++) {
        const sequence: Record<string, OptimizationScalar>[] = [];
        await runner.run({
          description: {
            ...description,
            study: { ...description.study, trials: 8 },
          },
          evaluate: async (_trial, suggestedValues) => {
            sequence.push(suggestedValues);
            return {
              kind: "objective",
              objective: objectiveOf(suggestedValues),
            };
          },
          onTrial: () => {},
          isCancelled: () => false,
        });
        sequences.push(sequence);
      }
      expect(sequences[0]).toEqual(sequences[1]);

      await expect(
        runner.run({
          description,
          evaluate: async () => ({ kind: "objective", objective: Number.NaN }),
          onTrial: () => {},
          isCancelled: () => false,
        }),
      ).rejects.toThrow("trial objective must be a finite number");
    },
    loadTimeout,
  );
});
