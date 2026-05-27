/**
 * Headless evaluation sandbox interface.
 *
 * Petrinaut runs user-authored JavaScript in several places (scenario
 * expressions, metric bodies, simulation/Monte Carlo worker user code, and
 * the UI-layer visualizer). To allow hosts to isolate that code behind a
 * sandboxed iframe with no cookies and no network egress, every call site
 * goes through this abstraction.
 *
 * `CoreEvalSandbox` covers the non-React parts. The UI layer extends it
 * with `EvalSandbox` to add the visualizer host. Two implementations exist:
 *
 * - `createInlineCoreSandbox()` — in-realm eval (default; no isolation, same
 *   as the current behavior).
 * - `createIframeCoreSandbox({ iframeWindow })` — postMessage to a
 *   sandboxed iframe whose unique opaque origin enforces the boundary.
 *
 * Replacing user JS with a restricted DSL would only need a third
 * implementation behind the same interface.
 */

import type { WorkerLike } from "../environment";
import type {
  CompiledMetric,
  MetricState,
} from "../simulation/authoring/metric/compile-metric";
import type {
  CompiledScenarioResult,
  CompileScenarioOutcome,
  ScenarioParameterValues,
} from "../simulation/authoring/scenario/compile-scenario";
import type { Color, Metric, Parameter, Place, Scenario } from "../types/sdcpn";

export type CompileScenarioArgs = {
  scenario: Scenario;
  netParameters: Parameter[];
  places?: Place[];
  types?: Color[];
  scenarioParameterValues?: ScenarioParameterValues;
};

/**
 * Handle to a compiled metric function. The metric body itself is held
 * inside whichever realm the sandbox owns; callers evaluate it by sending
 * `MetricState` snapshots to `evaluate` / `evaluateBatch`.
 *
 * In the inline sandbox this is a thin synchronous-under-the-hood wrapper.
 * In the iframe sandbox each call is a postMessage round-trip; callers
 * should batch frames where possible.
 */
export interface MetricEvaluator {
  /** Evaluate a single frame's metric state. Throws on user-code error. */
  evaluate(state: MetricState): Promise<number>;
  /**
   * Evaluate a batch of frames in one round-trip. Returns one entry per
   * input; an entry is either a number (success) or `{ error: string }` if
   * the user code threw for that specific frame. Latency-optimised for
   * streaming timeline rendering.
   */
  evaluateBatch(states: MetricState[]): Promise<(number | { error: string })[]>;
  /** Release the underlying compiled function. Idempotent. */
  dispose(): void;
}

export interface CoreEvalSandbox {
  /**
   * Compile a scenario into resolved parameter values and an initial
   * marking. One-shot RPC.
   */
  compileScenario(args: CompileScenarioArgs): Promise<CompileScenarioOutcome>;

  /**
   * Build a {@link MetricEvaluator} for the supplied metric body. The
   * handle is owned by the sandbox until `dispose()` is called.
   */
  createMetricEvaluator(metric: Metric): Promise<MetricEvaluator>;

  /**
   * Create a {@link WorkerLike} for the simulation engine. The sandbox
   * decides where the worker lives — the parent realm (inline) or inside
   * the sandbox iframe (iframe).
   */
  createSimulationWorker(): Promise<WorkerLike>;

  /**
   * Create a {@link WorkerLike} for the Monte Carlo engine. Same realm
   * placement as the simulation worker.
   */
  createMonteCarloWorker(): Promise<WorkerLike>;

  /** Tear down all sandbox state. Idempotent. */
  dispose(): void;
}

/**
 * Re-export the compiled-scenario-result and metric-state types so callers
 * importing the sandbox interface don't also need a separate path import.
 */
export type {
  CompiledMetric,
  CompiledScenarioResult,
  CompileScenarioOutcome,
  MetricState,
};
