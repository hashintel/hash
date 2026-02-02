/**
 * React hook for communicating with the simulation WebWorker.
 *
 * Provides a clean interface for the SimulationProvider to:
 * - Initialize simulations
 * - Control execution (start/pause/stop)
 * - Receive frames
 * - Hot-reload parameters
 *
 * @see ./README.md for usage documentation
 */

import { useEffect, useRef, useState } from "react";

import type { SDCPN } from "../../core/types/sdcpn";
import type { InitialMarking, SimulationFrame } from "../context";
import type { ToMainMessage, ToWorkerMessage } from "./messages";

/**
 * Status of the simulation worker.
 */
export type WorkerStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "running"
  | "paused"
  | "complete"
  | "error";

/**
 * State managed by the worker hook.
 */
export type WorkerState = {
  status: WorkerStatus;
  frames: SimulationFrame[];
  error: string | null;
  errorItemId: string | null;
};

/**
 * Configuration for initializing a simulation.
 */
export type InitializeParams = {
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  /** Maximum simulation time (immutable once set). Null means no limit. */
  maxTime: number | null;
  /** Maximum frames the worker can compute ahead before waiting for ack (backpressure) */
  maxFramesAhead?: number;
  /** Number of frames to compute in each batch before checking for messages */
  batchSize?: number;
};

/**
 * Configuration for backpressure settings.
 */
export type BackpressureParams = {
  /** Maximum frames the worker can compute ahead before waiting for ack */
  maxFramesAhead?: number;
  /** Number of frames to compute in each batch before checking for messages */
  batchSize?: number;
};

/**
 * Actions available from the worker hook.
 */
export type WorkerActions = {
  /** Initialize simulation with SDCPN and configuration */
  initialize: (params: InitializeParams) => void;
  /** Start or resume computing frames */
  start: () => void;
  /** Pause computation */
  pause: () => void;
  /** Stop and discard simulation */
  stop: () => void;
  /** Update backpressure configuration at runtime */
  setBackpressure: (params: BackpressureParams) => void;
  /** Acknowledge receipt of frames up to the given frame number (for backpressure) */
  ack: (frameNumber: number) => void;
  /** Reset to initial state */
  reset: () => void;
};

const initialState: WorkerState = {
  status: "idle",
  frames: [],
  error: null,
  errorItemId: null,
};

/**
 * Hook for managing the simulation WebWorker.
 *
 * @example
 * ```tsx
 * const { state, actions } = useSimulationWorker();
 *
 * // Initialize and start
 * actions.initialize({ sdcpn, initialMarking, parameterValues, seed, dt });
 * actions.start();
 *
 * // Access frames
 * const currentFrame = state.frames[currentFrameIndex];
 *
 * // Control
 * actions.pause();
 * actions.updateParameters({ birthRate: 0.5 });
 * actions.start();
 * ```
 */
export function useSimulationWorker(): {
  state: WorkerState;
  actions: WorkerActions;
} {
  const [state, setState] = useState<WorkerState>(initialState);
  const workerRef = useRef<Worker | null>(null);

  // Initialize worker on mount
  useEffect(() => {
    const worker = new Worker(
      new URL("./simulation.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<ToMainMessage>) => {
      const message = event.data;

      switch (message.type) {
        case "ready":
          setState((prev) => ({
            ...prev,
            status: prev.status === "initializing" ? "ready" : prev.status,
          }));
          break;

        case "frame":
          setState((prev) => ({
            ...prev,
            frames: [...prev.frames, message.frame],
          }));
          break;

        case "frames":
          setState((prev) => ({
            ...prev,
            frames: [...prev.frames, ...message.frames],
          }));
          break;

        case "complete":
          setState((prev) => ({
            ...prev,
            status: "complete",
          }));
          break;

        case "paused":
          setState((prev) => ({
            ...prev,
            status: "paused",
          }));
          break;

        case "error":
          setState((prev) => ({
            ...prev,
            status: "error",
            error: message.message,
            errorItemId: message.itemId,
          }));
          break;
      }
    };

    worker.onerror = (error) => {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error.message || "Worker error",
        errorItemId: null,
      }));
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  // Helper to post messages
  const postMessage = (message: ToWorkerMessage) => {
    workerRef.current?.postMessage(message);
  };

  // Actions - React Compiler automatically memoizes these based on dependencies
  const initialize: WorkerActions["initialize"] = ({
    sdcpn,
    initialMarking,
    parameterValues,
    seed,
    dt,
    maxTime,
    maxFramesAhead,
    batchSize,
  }) => {
    setState({
      status: "initializing",
      frames: [],
      error: null,
      errorItemId: null,
    });

    // Convert Map to array for serialization
    const serializedMarking = Array.from(initialMarking.entries());

    postMessage({
      type: "init",
      sdcpn,
      initialMarking: serializedMarking,
      parameterValues,
      seed,
      dt,
      maxTime,
      maxFramesAhead,
      batchSize,
    });
  };

  const start: WorkerActions["start"] = () => {
    setState((prev) => ({ ...prev, status: "running" }));
    postMessage({ type: "start" });
  };

  const pause: WorkerActions["pause"] = () => {
    postMessage({ type: "pause" });
    // Status will be updated when worker confirms
  };

  const stop: WorkerActions["stop"] = () => {
    postMessage({ type: "stop" });
    setState(initialState);
  };

  const setBackpressure: WorkerActions["setBackpressure"] = ({
    maxFramesAhead,
    batchSize,
  }) => {
    postMessage({ type: "setBackpressure", maxFramesAhead, batchSize });
  };

  const ack: WorkerActions["ack"] = (frameNumber) => {
    postMessage({ type: "ack", frameNumber });
  };

  const reset: WorkerActions["reset"] = () => {
    postMessage({ type: "stop" });
    setState(initialState);
  };

  // Actions object - React Compiler memoizes this automatically
  const actions: WorkerActions = {
    initialize,
    start,
    pause,
    stop,
    setBackpressure,
    ack,
    reset,
  };

  return { state, actions };
}
