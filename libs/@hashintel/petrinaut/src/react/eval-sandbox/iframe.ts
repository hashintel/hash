/**
 * Iframe-backed UI-layer {@link EvalSandbox}.
 *
 * Builds:
 *  - one **headless** sandbox iframe (hidden, off-screen) running
 *    `#mode=headless` — owns scenario / metric / worker compilation.
 *  - one **per-place** visualizer iframe (visible, mounted inside the
 *    place-visualizer subview container) running `#mode=visualizer` —
 *    holds the user's React component tree.
 *
 * Both iframes use `sandbox="allow-scripts"` only — that gives them a
 * unique opaque origin (no `hash.ai` cookies, no DOM access to the
 * parent, no `localStorage`). The page they load applies
 * `connect-src 'none'` so user code cannot make network requests.
 *
 * Frame placement and `src` are caller-controlled (the host typically
 * serves the sandbox runtime at `/petrinaut-sandbox`).
 */

import {
  createIframeCoreSandbox,
  deserializeError,
  type SerializedError,
} from "@hashintel/petrinaut-core";

import type { EvalSandbox, VisualizerProps } from "./interface";
import type {
  ParentToVisualizerMessage,
  VisualizerToParentMessage,
} from "./visualizer-protocol";

export interface CreateIframeSandboxOptions {
  /**
   * Base URL for the sandbox runtime page. The headless iframe loads
   * `${src}#mode=headless`; per-visualizer iframes load
   * `${src}#mode=visualizer`.
   *
   * In hash-frontend this is `"/petrinaut-sandbox"` — see
   * `apps/hash-frontend/src/pages/petrinaut-sandbox.page.tsx`.
   */
  src: string;
  /**
   * Optional error sink. Errors from inside any sandbox iframe (headless
   * or visualizer) are forwarded here for the host's error tracker
   * (e.g. Sentry).
   */
  onError?: (error: Error, origin: "sandbox" | "visualizer") => void;
}

interface VisualizerIframeEntry {
  iframe: HTMLIFrameElement;
  ready: boolean;
  pending: ParentToVisualizerMessage[];
  messageListener: (event: MessageEvent) => void;
}

/**
 * Spawn a fresh iframe + return a Promise that resolves to its
 * `contentWindow` once the iframe DOM is loaded. Note "loaded" means
 * the iframe document exists — the sandbox runtime inside it announces
 * its own ready handshake separately.
 */
function createHiddenHeadlessIframe(src: string): {
  iframe: HTMLIFrameElement;
  ready: Promise<Window>;
} {
  const iframe = document.createElement("iframe");
  iframe.sandbox.add("allow-scripts");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position: absolute; width: 0; height: 0; border: 0; opacity: 0; pointer-events: none;";
  iframe.src = `${src}#mode=headless`;

  const ready = new Promise<Window>((resolve, reject) => {
    iframe.addEventListener("load", () => {
      const win = iframe.contentWindow;
      if (!win) {
        reject(new Error("Headless sandbox iframe has no contentWindow"));
        return;
      }
      resolve(win);
    });
    iframe.addEventListener("error", () => {
      reject(new Error("Headless sandbox iframe failed to load"));
    });
  });

  document.body.appendChild(iframe);
  return { iframe, ready };
}

export function createIframeSandbox(
  options: CreateIframeSandboxOptions,
): EvalSandbox {
  const { src, onError } = options;

  // --- Headless sandbox iframe -----------------------------------------
  // Spin it up eagerly; first scenario/metric/worker request awaits
  // both the DOM load *and* the runtime's `ready` handshake.
  const { iframe: headlessIframe, ready: headlessReady } =
    createHiddenHeadlessIframe(src);

  // Resolved lazily — the core sandbox accepts a `Window` and buffers
  // its own requests until its `ready` arrives.
  let coreSandboxPromise: Promise<
    ReturnType<typeof createIframeCoreSandbox>
  > | null = null;
  const ensureCore = async () => {
    if (!coreSandboxPromise) {
      coreSandboxPromise = headlessReady.then((win) =>
        createIframeCoreSandbox({
          iframeWindow: win,
          onUncaughtError: (err, origin) => onError?.(err, origin),
        }),
      );
    }
    return coreSandboxPromise;
  };

  // --- Visualizer host factory -----------------------------------------
  const visualizerIframes = new Set<VisualizerIframeEntry>();

  const createVisualizerIframe = (
    container: HTMLElement,
  ): VisualizerIframeEntry => {
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.cssText = "width: 100%; height: 100%; border: 0;";
    iframe.src = `${src}#mode=visualizer`;
    container.appendChild(iframe);

    const entry: VisualizerIframeEntry = {
      iframe,
      ready: false,
      pending: [],
      messageListener: () => {},
    };

    const send = (message: ParentToVisualizerMessage): void => {
      if (!entry.ready) {
        entry.pending.push(message);
        return;
      }
      iframe.contentWindow?.postMessage(message, "*");
    };

    entry.messageListener = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) {
        return;
      }
      const data = event.data as VisualizerToParentMessage | null;
      if (!data || typeof data !== "object" || !("type" in data)) {
        return;
      }
      switch (data.type) {
        case "ready": {
          entry.ready = true;
          const queued = entry.pending.slice();
          entry.pending.length = 0;
          for (const message of queued) {
            iframe.contentWindow?.postMessage(message, "*");
          }
          break;
        }
        case "uncaughtError": {
          onError?.(
            deserializeError(data.error as SerializedError),
            "visualizer",
          );
          break;
        }
      }
    };
    window.addEventListener("message", entry.messageListener);

    // Expose `send` so the caller can post init/setCode/setProps without
    // re-deriving the entry. We attach it as a closure-bound helper on
    // the entry via a side property:
    (
      entry as VisualizerIframeEntry & {
        send: (message: ParentToVisualizerMessage) => void;
      }
    ).send = send;

    visualizerIframes.add(entry);
    return entry;
  };

  const disposeVisualizerEntry = (entry: VisualizerIframeEntry) => {
    window.removeEventListener("message", entry.messageListener);
    entry.iframe.remove();
    visualizerIframes.delete(entry);
  };

  // --- EvalSandbox surface ---------------------------------------------
  let disposed = false;
  const ensureLive = () => {
    if (disposed) {
      throw new Error("EvalSandbox: disposed");
    }
  };

  return {
    async compileScenario(args) {
      ensureLive();
      const core = await ensureCore();
      return core.compileScenario(args);
    },
    async createMetricEvaluator(metric) {
      ensureLive();
      const core = await ensureCore();
      return core.createMetricEvaluator(metric);
    },
    async createSimulationWorker() {
      ensureLive();
      const core = await ensureCore();
      return core.createSimulationWorker();
    },
    async createMonteCarloWorker() {
      ensureLive();
      const core = await ensureCore();
      return core.createMonteCarloWorker();
    },
    createVisualizerHost() {
      ensureLive();
      return {
        mount({ container, code, props }) {
          ensureLive();
          const entry = createVisualizerIframe(container);
          const send = (
            entry as VisualizerIframeEntry & {
              send: (m: ParentToVisualizerMessage) => void;
            }
          ).send;
          send({ type: "visualizerInit", code, props });

          let handleDisposed = false;
          return {
            setCode(nextCode: string) {
              if (handleDisposed || disposed) {
                return;
              }
              send({ type: "visualizerCode", code: nextCode });
            },
            setProps(nextProps: VisualizerProps) {
              if (handleDisposed || disposed) {
                return;
              }
              send({ type: "visualizerProps", props: nextProps });
            },
            dispose() {
              if (handleDisposed) {
                return;
              }
              handleDisposed = true;
              disposeVisualizerEntry(entry);
            },
          };
        },
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      // Tear down any live visualizer iframes first; they're independent
      // of the headless sandbox. Snapshot via Array.from because
      // `disposeVisualizerEntry` mutates the iterating set.
      for (const entry of Array.from(visualizerIframes)) {
        disposeVisualizerEntry(entry);
      }
      // Dispose the headless sandbox if it was constructed.
      if (coreSandboxPromise) {
        coreSandboxPromise
          .then((core) => core.dispose())
          .catch(() => {
            // If the headless iframe never loaded, nothing to dispose.
          });
      }
      headlessIframe.remove();
    },
  };
}
