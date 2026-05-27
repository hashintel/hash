/**
 * In-realm implementation of {@link CoreEvalSandbox}.
 *
 * Same security posture as Petrinaut before the sandbox abstraction
 * existed: user code is evaluated via `new Function()` inside the host's
 * realm, protected only by `runSandboxed` / `SHADOWED_GLOBALS` for
 * scenario and metric bodies. Use this when sandboxing is not desired
 * (demo site, storybook, tests, headless Node usage).
 *
 * Hosts that need real isolation construct
 * {@link createIframeCoreSandbox} instead.
 */

import {
  compileMetric,
  type CompiledMetric,
  type MetricState,
} from "../simulation/authoring/metric/compile-metric";
import { compileScenario } from "../simulation/authoring/scenario/compile-scenario";
import { createMonteCarloWorker } from "../simulation/monte-carlo/worker/create-monte-carlo-worker";
import { createSimulationWorker } from "../simulation/worker/create-simulation-worker";

import type { WorkerLike } from "../environment";
import type { Metric } from "../types/sdcpn";
import type {
  CompileScenarioArgs,
  CompileScenarioOutcome,
  CoreEvalSandbox,
  MetricEvaluator,
} from "./interface";

function buildInlineMetricEvaluator(fn: CompiledMetric): MetricEvaluator {
  let disposed = false;
  const ensureLive = () => {
    if (disposed) {
      throw new Error("MetricEvaluator: already disposed");
    }
  };

  return {
    async evaluate(state: MetricState) {
      ensureLive();
      // `fn` throws on invalid output; let it surface to the caller.
      return fn(state);
    },
    async evaluateBatch(states: MetricState[]) {
      ensureLive();
      return states.map((state) => {
        try {
          return fn(state);
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      });
    },
    dispose() {
      disposed = true;
    },
  };
}

/**
 * Build an in-realm {@link CoreEvalSandbox}. All methods complete
 * synchronously under the hood; they return Promises to match the
 * iframe implementation's signature so call sites are interchangeable.
 */
export function createInlineCoreSandbox(): CoreEvalSandbox {
  const evaluators = new Set<MetricEvaluator>();
  const workers = new Set<WorkerLike>();
  let disposed = false;

  return {
    async compileScenario(
      args: CompileScenarioArgs,
    ): Promise<CompileScenarioOutcome> {
      if (disposed) {
        throw new Error("CoreEvalSandbox: disposed");
      }
      return compileScenario(
        args.scenario,
        args.netParameters,
        args.places,
        args.types,
        args.scenarioParameterValues
          ? { scenarioParameterValues: args.scenarioParameterValues }
          : undefined,
      );
    },

    async createMetricEvaluator(metric: Metric): Promise<MetricEvaluator> {
      if (disposed) {
        throw new Error("CoreEvalSandbox: disposed");
      }
      const outcome = compileMetric(metric);
      if (!outcome.ok) {
        throw new Error(outcome.error);
      }
      const evaluator = buildInlineMetricEvaluator(outcome.fn);
      // Wrap dispose so we can untrack on disposal.
      const wrapped: MetricEvaluator = {
        evaluate: (state) => evaluator.evaluate(state),
        evaluateBatch: (states) => evaluator.evaluateBatch(states),
        dispose() {
          evaluator.dispose();
          evaluators.delete(wrapped);
        },
      };
      evaluators.add(wrapped);
      return wrapped;
    },

    async createSimulationWorker(): Promise<WorkerLike> {
      if (disposed) {
        throw new Error("CoreEvalSandbox: disposed");
      }
      const worker = await createSimulationWorker();
      workers.add(worker);
      return worker;
    },

    async createMonteCarloWorker(): Promise<WorkerLike> {
      if (disposed) {
        throw new Error("CoreEvalSandbox: disposed");
      }
      const worker = await createMonteCarloWorker();
      workers.add(worker);
      return worker;
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const evaluator of evaluators) {
        evaluator.dispose();
      }
      evaluators.clear();
      for (const worker of workers) {
        try {
          worker.terminate();
        } catch {
          // Already torn down.
        }
      }
      workers.clear();
    },
  };
}
