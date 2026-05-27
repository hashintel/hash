/**
 * Default in-realm UI-layer {@link EvalSandbox}.
 *
 * Composes {@link createInlineCoreSandbox} (scenarios, metrics, workers)
 * with {@link createInlineVisualizerHost} (React tree-based visualizer).
 * Behaviour is identical to pre-sandbox Petrinaut — use when no
 * isolation is required (storybook, demo site, headless tests, hosts
 * that opt out of the iframe path).
 */

import { createInlineCoreSandbox } from "@hashintel/petrinaut-core";

import { createInlineVisualizerHost } from "./inline-visualizer-host";

import type { EvalSandbox } from "./interface";

export interface CreateInlineSandboxOptions {
  /**
   * Optional error sink. Inline scenario / metric compilation errors are
   * already returned in their structured `outcome` shapes; this callback
   * fires for visualizer-side compile errors (which previously only
   * surfaced via `console.error`).
   */
  onError?: (error: Error) => void;
}

/**
 * Build a {@link EvalSandbox} that evaluates user code directly in the
 * host realm. Default for `<Petrinaut>` when no `evalSandbox` prop is
 * supplied.
 */
export function createInlineSandbox(
  options: CreateInlineSandboxOptions = {},
): EvalSandbox {
  const core = createInlineCoreSandbox();
  return {
    compileScenario: (args) => core.compileScenario(args),
    createMetricEvaluator: (metric) => core.createMetricEvaluator(metric),
    createSimulationWorker: () => core.createSimulationWorker(),
    createMonteCarloWorker: () => core.createMonteCarloWorker(),
    dispose: () => core.dispose(),
    createVisualizerHost() {
      return createInlineVisualizerHost({ onError: options.onError });
    },
  };
}
