/**
 * Inline visualizer host.
 *
 * Renders the user's compiled visualizer component as a React tree
 * inside the supplied DOM container (no iframe). Uses the existing
 * {@link VisualizerErrorBoundary} so render-time errors stay scoped to
 * the preview panel.
 *
 * This is the default behavior when no `evalSandbox` is supplied to
 * `<Petrinaut>` — it's identical to what the editor did before the
 * sandbox abstraction was introduced.
 */

import { type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { compileVisualizer } from "../../ui/lib/compile-visualizer";
import { VisualizerErrorBoundary } from "../../ui/views/Editor/panels/PropertiesPanel/place-properties/subviews/place-visualizer/visualizer-error-boundary";

import type {
  VisualizerHostFactory,
  VisualizerHostHandle,
  VisualizerProps,
} from "./interface";

interface InlineHostState {
  code: string;
  props: VisualizerProps;
}

function renderInline(
  root: Root,
  state: InlineHostState,
  onCompileError: (error: Error) => void,
): void {
  let element: ReactElement | null = null;
  try {
    const Component = compileVisualizer(state.code);
    element = (
      <Component
        tokens={state.props.tokens}
        parameters={state.props.parameters}
      />
    );
  } catch (error) {
    onCompileError(error instanceof Error ? error : new Error(String(error)));
    root.render(
      <VisualizerErrorBoundary>
        <div>
          Failed to compile visualizer code:{" "}
          {error instanceof Error ? error.message : String(error)}
        </div>
      </VisualizerErrorBoundary>,
    );
    return;
  }
  root.render(<VisualizerErrorBoundary>{element}</VisualizerErrorBoundary>);
}

export interface CreateInlineVisualizerHostOptions {
  /** Optional error sink — wired by `createInlineSandbox` to Sentry. */
  onError?: (error: Error) => void;
}

/**
 * Build an inline {@link VisualizerHostFactory}. The factory may be
 * called any number of times; each call produces an independent React
 * root mounted into the supplied container.
 */
export function createInlineVisualizerHost(
  options: CreateInlineVisualizerHostOptions = {},
): VisualizerHostFactory {
  return {
    mount({ container, code, props }) {
      const root = createRoot(container);
      const state: InlineHostState = { code, props };
      const reportError = (error: Error) => {
        // eslint-disable-next-line no-console
        console.error("Failed to compile visualizer code:", error);
        options.onError?.(error);
      };
      renderInline(root, state, reportError);

      let disposed = false;
      const handle: VisualizerHostHandle = {
        setCode(nextCode: string) {
          if (disposed) {
            return;
          }
          state.code = nextCode;
          renderInline(root, state, reportError);
        },
        setProps(nextProps: VisualizerProps) {
          if (disposed) {
            return;
          }
          state.props = nextProps;
          renderInline(root, state, reportError);
        },
        dispose() {
          if (disposed) {
            return;
          }
          disposed = true;
          root.unmount();
        },
      };
      return handle;
    },
  };
}
