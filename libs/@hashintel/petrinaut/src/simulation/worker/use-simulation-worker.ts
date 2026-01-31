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
import type {
  InitialMarking,
  ParameterValues,
  SimulationFrame,
} from "../context";
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
 * Actions available from the worker hook.
 */
export type WorkerActions = {
  /** Initialize simulation with SDCPN and configuration */
  initialize: (params: {
    sdcpn: SDCPN;
    initialMarking: InitialMarking;
    parameterValues: Record<string, string>;
    seed: number;
    dt: number;
  }) => void;
  /** Start or resume computing frames */
  start: () => void;
  /** Pause computation */
  pause: () => void;
  /** Stop and discard simulation */
  stop: () => void;
  /** Hot-reload parameter values */
  updateParameters: (parameterValues: ParameterValues) => void;
  /** Update maximum simulation time */
  setMaxTime: (maxTime: number | null) => void;
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
 * Interval (in ms) between acknowledgment messages to worker.
 * Provides backpressure feedback.
 */
const ACK_INTERVAL_MS = 100;

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
  const ackIntervalRef = useRef<number | null>(null);
  const framesLengthRef = useRef(0);

  // Track frames length for ack
  useEffect(() => {
    framesLengthRef.current = state.frames.length;
  }, [state.frames.length]);

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

    // Set up periodic ack for backpressure
    ackIntervalRef.current = window.setInterval(() => {
      if (workerRef.current && framesLengthRef.current > 0) {
        workerRef.current.postMessage({
          type: "ack",
          frameNumber: framesLengthRef.current,
        } satisfies ToWorkerMessage);
      }
    }, ACK_INTERVAL_MS);

    return () => {
      worker.terminate();
      if (ackIntervalRef.current !== null) {
        clearInterval(ackIntervalRef.current);
      }
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

  const updateParameters: WorkerActions["updateParameters"] = (
    parameterValues,
  ) => {
    postMessage({ type: "updateParameters", parameterValues });
  };

  const setMaxTime: WorkerActions["setMaxTime"] = (maxTime) => {
    postMessage({ type: "setMaxTime", maxTime });
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
    updateParameters,
    setMaxTime,
    reset,
  };

  return { state, actions };
}
