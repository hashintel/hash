import { use, useCallback, useEffect, useRef, useState } from "react";

import type { SDCPN } from "../core/types/sdcpn";
import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useNotifications } from "../notifications/notifications-context";
import { SDCPNContext } from "../state/sdcpn-context";
import {
  type InitialMarking,
  SimulationContext,
  type SimulationContextValue,
  type SimulationFrame,
  type SimulationState,
} from "./context";
import {
  useSimulationWorker,
  type WorkerStatus,
} from "./worker/use-simulation-worker";

/**
 * Internal state for the simulation provider.
 * Configuration values that aren't managed by the worker.
 */
type SimulationStateValues = {
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
  dt: number;
  maxTime: number | null;
  computeBufferDuration: number;
};

const initialStateValues: SimulationStateValues = {
  parameterValues: {},
  initialMarking: new Map(),
  dt: 0.01,
  maxTime: null,
  computeBufferDuration: 1,
};

/**
 * Maps worker status to SimulationContext state.
 */
function mapWorkerStatusToSimulationState(
  status: WorkerStatus,
): SimulationState {
  switch (status) {
    case "idle":
    case "initializing":
      return "NotRun";
    case "ready":
    case "paused":
      return "Paused";
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
  }
}

/**
 * Internal component that subscribes to simulation state changes
 * and shows notifications when appropriate.
 */
const SimulationStateNotifier: React.FC = () => {
  const { notify } = useNotifications();
  const { state } = use(SimulationContext);
  const previousStateRef = useRef<SimulationState | null>(null);

  useEffect(() => {
    const previousState = previousStateRef.current;
    previousStateRef.current = state;

    // Notify when simulation completes
    if (state === "Complete" && previousState !== "Complete") {
      notify({ message: "Simulation complete" });
    }
  }, [state, notify]);

  return null;
};

type SimulationProviderProps = React.PropsWithChildren;

export const SimulationProvider: React.FC<SimulationProviderProps> = ({
  children,
}) => {
  const sdcpnContext = use(SDCPNContext);
  const { petriNetId, petriNetDefinition } = sdcpnContext;

  const sdcpnRef = useRef<SDCPN>(petriNetDefinition);
  useEffect(() => {
    sdcpnRef.current = petriNetDefinition;
  }, [petriNetDefinition]);

  // Configuration state (not managed by worker)
  const [stateValues, setStateValues] =
    useState<SimulationStateValues>(initialStateValues);

  // Use refs to access latest state in callbacks
  const stateValuesRef = useRef(stateValues);
  useEffect(() => {
    stateValuesRef.current = stateValues;
  }, [stateValues]);

  const getSDCPN = useCallback(() => sdcpnRef.current, []);

  // WebWorker for simulation computation
  const { state: workerState, actions: workerActions } = useSimulationWorker();

  // Reinitialize when petriNetId changes
  useEffect(() => {
    workerActions.reset();
    setStateValues(initialStateValues);
  }, [petriNetId, workerActions]);

  // Sync maxTime changes to worker
  useEffect(() => {
    workerActions.setMaxTime(stateValues.maxTime);
  }, [stateValues.maxTime, workerActions]);

  //
  // Actions
  //

  const setInitialMarking: SimulationContextValue["setInitialMarking"] = (
    placeId,
    marking,
  ) => {
    setStateValues((prev) => {
      const newMarking = new Map(prev.initialMarking);
      newMarking.set(placeId, marking);
      return { ...prev, initialMarking: newMarking };
    });
  };

  const setParameterValue: SimulationContextValue["setParameterValue"] = (
    parameterId,
    value,
  ) => {
    setStateValues((prev) => ({
      ...prev,
      parameterValues: {
        ...prev.parameterValues,
        [parameterId]: value,
      },
    }));
  };

  const setDt: SimulationContextValue["setDt"] = (dt) => {
    setStateValues((prev) => ({ ...prev, dt }));
  };

  const setMaxTime: SimulationContextValue["setMaxTime"] = (maxTime) => {
    setStateValues((prev) => ({ ...prev, maxTime }));
  };

  const setComputeBufferDuration: SimulationContextValue["setComputeBufferDuration"] =
    (duration) => {
      setStateValues((prev) => ({ ...prev, computeBufferDuration: duration }));
    };

  const initializeParameterValuesFromDefaults: SimulationContextValue["initializeParameterValuesFromDefaults"] =
    () => {
      setStateValues((prev) => {
        const sdcpn = getSDCPN();
        const defaultValues = deriveDefaultParameterValues(sdcpn.parameters);

        const parameterValues: Record<string, string> = {};
        for (const [key, value] of Object.entries(defaultValues)) {
          parameterValues[key] = String(value);
        }

        return { ...prev, parameterValues };
      });
    };

  const initialize: SimulationContextValue["initialize"] = ({ seed, dt }) => {
    const currentState = stateValuesRef.current;
    const sdcpn = getSDCPN();

    // Delegate to worker
    workerActions.initialize({
      sdcpn,
      initialMarking: currentState.initialMarking,
      parameterValues: currentState.parameterValues,
      seed,
      dt,
    });

    // Update local dt
    setStateValues((prev) => ({ ...prev, dt }));
  };

  const run: SimulationContextValue["run"] = () => {
    const simulationState = mapWorkerStatusToSimulationState(
      workerState.status,
    );

    // Guard against invalid states
    if (simulationState === "Running") {
      return; // Already running
    }

    if (
      workerState.status === "idle" ||
      workerState.status === "initializing"
    ) {
      return; // No simulation initialized
    }

    if (simulationState === "Error" || simulationState === "Complete") {
      return; // Can't run from these states
    }

    workerActions.start();
  };

  const pause: SimulationContextValue["pause"] = () => {
    workerActions.pause();
  };

  const reset: SimulationContextValue["reset"] = () => {
    const sdcpn = getSDCPN();
    const defaultValues = deriveDefaultParameterValues(sdcpn.parameters);

    const parameterValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(defaultValues)) {
      parameterValues[key] = String(value);
    }

    workerActions.reset();

    setStateValues((prev) => ({
      ...prev,
      parameterValues,
      // Keep initialMarking when resetting - it's configuration, not simulation state
    }));
  };

  // Frame access - get from worker state
  const getFrame = useCallback(
    (frameIndex: number): Promise<SimulationFrame | null> => {
      const frame = workerState.frames[frameIndex];
      return Promise.resolve(frame ?? null);
    },
    [workerState.frames],
  );

  // Get all frames - get from worker state
  const getAllFrames = useCallback((): Promise<SimulationFrame[]> => {
    return Promise.resolve(workerState.frames);
  }, [workerState.frames]);

  // Map worker state to context value
  const simulationState = mapWorkerStatusToSimulationState(workerState.status);
  const totalFrames = workerState.frames.length;

  const contextValue: SimulationContextValue = {
    state: simulationState,
    error: workerState.error,
    errorItemId: workerState.errorItemId,
    parameterValues: stateValues.parameterValues,
    initialMarking: stateValues.initialMarking,
    dt: stateValues.dt,
    maxTime: stateValues.maxTime,
    computeBufferDuration: stateValues.computeBufferDuration,
    totalFrames,
    getFrame,
    getAllFrames,
    setInitialMarking,
    setParameterValue,
    setDt,
    setMaxTime,
    setComputeBufferDuration,
    initializeParameterValuesFromDefaults,
    initialize,
    run,
    pause,
    reset,
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      <SimulationStateNotifier />
      {children}
    </SimulationContext.Provider>
  );
};
