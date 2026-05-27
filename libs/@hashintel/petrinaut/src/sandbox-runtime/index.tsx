/**
 * Runtime mounted *inside* the sandbox iframe.
 *
 * Two modes, picked from `window.location.hash`:
 *
 * - `#mode=headless` — runs the React-free core runtime
 *   ({@link mountCoreSandboxRuntime}) which handles scenario / metric
 *   compilation requests and spawns the simulation + Monte Carlo
 *   workers in-iframe.
 * - `#mode=visualizer` — mounts a React root in the iframe's
 *   `document.body`, listens for `visualizerInit` / `visualizerCode` /
 *   `visualizerProps` messages, and renders the user's compiled
 *   component.
 *
 * This module is the published `@hashintel/petrinaut/sandbox-runtime`
 * subpath. The hash-frontend `petrinaut-sandbox` page imports and
 * invokes {@link mountSandboxRuntime}.
 */

import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  mountCoreSandboxRuntime,
  serializeError,
  type SerializedError,
} from "@hashintel/petrinaut-core";

import { compileVisualizer } from "../ui/lib/compile-visualizer";
import { VisualizerErrorBoundary } from "../ui/views/Editor/panels/PropertiesPanel/place-properties/subviews/place-visualizer/visualizer-error-boundary";

import type { VisualizerProps } from "../react/eval-sandbox/interface";
import type {
  ParentToVisualizerMessage,
  VisualizerToParentMessage,
} from "../react/eval-sandbox/visualizer-protocol";

function postToParent(message: VisualizerToParentMessage): void {
  window.parent.postMessage(message, "*");
}

function forwardErrorToParent(
  value: unknown,
  origin: "visualizer" = "visualizer",
): void {
  postToParent({
    type: "uncaughtError",
    origin,
    error: serializeError(value) as SerializedError,
  });
}

/* -------------------------------------------------------------------------- */
/* Visualizer mode                                                            */
/* -------------------------------------------------------------------------- */

interface VisualizerHostProps {
  initialCode: string;
  initialProps: VisualizerProps;
  subscribe: (
    listener: (message: ParentToVisualizerMessage) => void,
  ) => () => void;
}

/**
 * Top-level React component for the visualizer iframe. Compiles the
 * user code with `compileVisualizer` and re-renders on `setProps` /
 * `setCode` messages.
 */
const VisualizerRoot: React.FC<VisualizerHostProps> = ({
  initialCode,
  initialProps,
  subscribe,
}) => {
  "use no memo"; // We deliberately recompile when `code` changes.

  const [code, setCode] = useState(initialCode);
  const [props, setProps] = useState(initialProps);

  useEffect(() => {
    return subscribe((message) => {
      switch (message.type) {
        case "visualizerCode":
          setCode(message.code);
          break;
        case "visualizerProps":
          setProps(message.props);
          break;
        case "visualizerInit":
          // `visualizerInit` only fires once before the first render — if
          // we receive it again, treat it as a reset.
          setCode(message.code);
          setProps(message.props);
          break;
      }
    });
  }, [subscribe]);

  const Component = useMemo(() => {
    try {
      return compileVisualizer(code);
    } catch (error) {
      forwardErrorToParent(error);
      return null;
    }
  }, [code]);

  if (!Component) {
    return <div>Failed to compile visualizer code (see parent console).</div>;
  }

  return (
    <VisualizerErrorBoundary>
      {/* eslint-disable-next-line react-hooks-js/static-components -- Runtime visualizer code intentionally creates a component from user input. */}
      <Component tokens={props.tokens} parameters={props.parameters} />
    </VisualizerErrorBoundary>
  );
};

function mountVisualizerMode(): () => void {
  let initListener: ((message: ParentToVisualizerMessage) => void) | null =
    null;
  const updateListeners = new Set<
    (message: ParentToVisualizerMessage) => void
  >();
  let mounted = false;

  const messageListener = (event: MessageEvent): void => {
    if (event.source !== window.parent) {
      return;
    }
    const data = event.data as ParentToVisualizerMessage | null;
    if (!data || typeof data !== "object" || !("type" in data)) {
      return;
    }
    if (!mounted && data.type === "visualizerInit") {
      initListener?.(data);
      return;
    }
    for (const listener of updateListeners) {
      listener(data);
    }
  };

  window.addEventListener("message", messageListener);

  // Wire window errors → parent.
  const errorListener = (event: ErrorEvent) => {
    forwardErrorToParent(event.error ?? event.message);
  };
  const rejectionListener = (event: PromiseRejectionEvent) => {
    forwardErrorToParent(event.reason);
  };
  window.addEventListener("error", errorListener);
  window.addEventListener("unhandledrejection", rejectionListener);

  // Ensure the body has a mount point.
  let container = document.getElementById("petrinaut-visualizer-root");
  if (!container) {
    container = document.createElement("div");
    container.id = "petrinaut-visualizer-root";
    container.style.cssText =
      "min-width: 0; min-height: 0; width: 100%; height: 100%;";
    document.body.appendChild(container);
  }

  // Apply a baseline body style so flex layouts in user code work.
  document.body.style.cssText = "margin: 0; padding: 0; overflow: hidden;";
  document.documentElement.style.cssText = "height: 100%;";
  document.body.style.height = "100%";

  initListener = (message) => {
    if (message.type !== "visualizerInit") {
      return;
    }
    mounted = true;
    const root = createRoot(container);
    const subscribe = (listener: (next: ParentToVisualizerMessage) => void) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    };
    root.render(
      <VisualizerRoot
        initialCode={message.code}
        initialProps={message.props}
        subscribe={subscribe}
      />,
    );

    const teardown = () => {
      root.unmount();
      mounted = false;
    };
    (
      window as Window & { __petrinaut_visualizer_teardown?: () => void }
    ).__petrinaut_visualizer_teardown = teardown;
  };

  // Announce readiness so the parent flushes its pre-ready queue.
  postToParent({ type: "ready" });

  return function teardown() {
    window.removeEventListener("message", messageListener);
    window.removeEventListener("error", errorListener);
    window.removeEventListener("unhandledrejection", rejectionListener);
    const win = window as Window & {
      __petrinaut_visualizer_teardown?: () => void;
    };
    win.__petrinaut_visualizer_teardown?.();
    delete win.__petrinaut_visualizer_teardown;
  };
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mount the sandbox runtime. Reads `window.location.hash` to decide
 * which mode to run.
 *
 * Returns a teardown function — handy for tests and hot-reload, but
 * production page mounts can ignore the return value.
 *
 * The hash is parsed as a `URLSearchParams` value so adding modes
 * later (e.g. `#mode=headless-debug`) doesn't accidentally match an
 * existing substring; `headless` is the default for any unknown /
 * absent mode.
 */
export function mountSandboxRuntime(): () => void {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const mode = params.get("mode");
  if (mode === "visualizer") {
    return mountVisualizerMode();
  }
  return mountCoreSandboxRuntime();
}
