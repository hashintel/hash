/**
 * UI-layer extension of {@link CoreEvalSandbox}.
 *
 * The visualizer is a React concern (it renders user JSX into a tree),
 * so it lives here rather than in `petrinaut-core`. The visualizer host
 * abstraction lets the call site (the place-visualizer subview) be
 * agnostic to whether the user code runs inline (React tree directly)
 * or sandboxed (React tree inside a per-instance iframe).
 */

import type { CoreEvalSandbox } from "@hashintel/petrinaut-core";

/** Props delivered to the user's compiled visualizer component. */
export interface VisualizerProps {
  tokens: Record<string, number>[];
  parameters: Record<string, number | boolean>;
}

/** Handle returned for a single mounted visualizer instance. */
export interface VisualizerHostHandle {
  /** Update the user's source code (recompiles inside the host). */
  setCode(code: string): void;
  /** Update the props passed to the user's visualizer component. */
  setProps(props: VisualizerProps): void;
  /** Detach and tear down the visualizer. Idempotent. */
  dispose(): void;
}

/**
 * Factory for mounting visualizer instances. The React subview calls
 * `mount` with an empty DOM container (already laid out by Panda CSS),
 * an initial code string, and initial props.
 *
 * Inline implementation: renders a React tree into `container` with the
 * existing `VisualizerErrorBoundary`.
 *
 * Iframe implementation: appends a per-place `<iframe sandbox="allow-scripts">`
 * to `container`, postMessages props in, hands back a handle that
 * tears the iframe down on `dispose`.
 */
export interface VisualizerHostFactory {
  mount(args: {
    container: HTMLElement;
    code: string;
    props: VisualizerProps;
  }): VisualizerHostHandle;
}

/**
 * UI-layer eval sandbox. The core fields cover scenario/metric/worker
 * concerns; `createVisualizerHost` adds the React-specific visualizer
 * concern on top.
 */
export interface EvalSandbox extends CoreEvalSandbox {
  /**
   * Build a {@link VisualizerHostFactory} for the lifetime of this
   * sandbox. The factory may produce multiple host handles (one per
   * place-visualizer subview).
   */
  createVisualizerHost(): VisualizerHostFactory;
}
