/**
 * `@hashintel/petrinaut/sandbox-inline` subpath entry.
 *
 * Exports the inline-only sandbox factory + types. Use this when you
 * want user code to evaluate in the same realm/origin as the rest of
 * the app (no iframe), e.g. for storybook or jest-based test setups
 * where pulling in `react-dom/client` and a dedicated host page is
 * overkill.
 *
 * Trade-off: this gives you no extra security boundary around user
 * code beyond the in-realm `runSandboxed` defenses. For untrusted
 * input use `sandbox-iframe`.
 */

export type {
  EvalSandbox,
  VisualizerHostFactory,
  VisualizerHostHandle,
  VisualizerProps,
} from "../react/eval-sandbox/interface";

export {
  createInlineSandbox,
  type CreateInlineSandboxOptions,
} from "../react/eval-sandbox/inline";

export {
  createInlineVisualizerHost,
  type CreateInlineVisualizerHostOptions,
} from "../react/eval-sandbox/inline-visualizer-host";
