/**
 * postMessage protocol for the per-visualizer iframe.
 *
 * Each visualizer iframe runs `mountSandboxRuntime()` with the URL
 * hash `#mode=visualizer`, which spins up an isolated React root
 * inside the iframe's body. The parent posts:
 *
 * - `visualizerInit` once, after the iframe announces `ready`, with
 *   the initial code and props.
 * - `visualizerCode` when the user edits the source code (recompiles).
 * - `visualizerProps` when the simulation frame changes (does not
 *   recompile).
 *
 * The iframe replies with `ready` (after mount), and forwards
 * `uncaughtError` for both compile-time and render-time errors using
 * the same {@link SerializedError} envelope as the core sandbox.
 */

import type { VisualizerProps } from "./interface";
import type { SerializedError } from "@hashintel/petrinaut-core";

export type ParentToVisualizerMessage =
  | {
      type: "visualizerInit";
      code: string;
      props: VisualizerProps;
    }
  | {
      type: "visualizerCode";
      code: string;
    }
  | {
      type: "visualizerProps";
      props: VisualizerProps;
    };

export type VisualizerToParentMessage =
  | { type: "ready" }
  | {
      type: "uncaughtError";
      origin: "visualizer";
      error: SerializedError;
    };
