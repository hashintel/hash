import { use, useCallback, useEffect, useRef, useState } from "react";
import ts from "typescript";

import { checkSDCPN } from "../core/checker/checker";
import { SDCPNItemError } from "../core/errors";
import { buildSimulation } from "../core/simulation/build-simulation";
import { checkTransitionEnablement } from "../core/simulation/check-transition-enablement";
import { computeNextFrame } from "../core/simulation/compute-next-frame";
import type { SDCPN } from "../core/types/sdcpn";
import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";
import { useNotifications } from "../notifications/notifications-context";
import { SDCPNContext } from "./sdcpn-context";
import {
  type InitialMarking,
  SimulationContext,
  type SimulationContextValue,
  type SimulationState,
} from "./simulation-context";

type SimulationStateValues = {
  simulation: SimulationContextValue["simulation"];
  state: SimulationState;
  error: string | null;
  errorItemId: string | null;
  parameterValues: Record<string, string>;
  initialMarking: InitialMarking;
  currentlyViewedFrame: number;
  dt: number;
};

const initialStateValues: SimulationStateValues = {
  simulation: null,
  state: "NotRun",
  error: null,
  errorItemId: null,
  parameterValues: {},
  initialMarking: new Map(),
  currentlyViewedFrame: 0,
  dt: 0.01,
};

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

  const [stateValues, setStateValues] =
    useState<SimulationStateValues>(initialStateValues);

  // Use refs to access latest state in callbacks
  const stateValuesRef = useRef(stateValues);
  useEffect(() => {
    stateValuesRef.current = stateValues;
  }, [stateValues]);

  const getSDCPN = useCallback(() => sdcpnRef.current, []);
  const getState = useCallback(() => stateValuesRef.current, []);

  // Reinitialize when petriNetId changes
  useEffect(() => {
    setStateValues(initialStateValues);
  }, [petriNetId]);

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
    const currentState = getState();

    if (currentState.state === "Running") {
      throw new Error(
        "Cannot initialize simulation while it is running. Please reset first.",
      );
    }

    try {
      const sdcpn = getSDCPN();

      // Check SDCPN validity before building simulation
      const checkResult = checkSDCPN(sdcpn);

      if (!checkResult.isValid) {
        const firstError = checkResult.itemDiagnostics[0]!;
        const firstDiagnostic = firstError.diagnostics[0]!;
        const errorMessage =
          typeof firstDiagnostic.messageText === "string"
            ? firstDiagnostic.messageText
            : ts.flattenDiagnosticMessageText(
                firstDiagnostic.messageText,
                "\n",
              );

        setStateValues({
          ...currentState,
          simulation: null,
          state: "Error" as const,
          error: `TypeScript error in ${firstError.itemType} (${firstError.itemId}): ${errorMessage}`,
          errorItemId: firstError.itemId,
        });
      } else {
        // Build the simulation instance using stored initialMarking and parameterValues
        const simulationInstance = buildSimulation({
          sdcpn,
          initialMarking: currentState.initialMarking,
          parameterValues: currentState.parameterValues,
          seed,
          dt,
        });

        setStateValues({
          ...currentState,
          simulation: simulationInstance,
          state: "Paused",
          error: null,
          errorItemId: null,
          currentlyViewedFrame: 0,
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error initializing simulation:", error);

      setStateValues({
        ...currentState,
        simulation: null,
        state: "Error",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during initialization",
        errorItemId: error instanceof SDCPNItemError ? error.itemId : null,
      });
    }
  };

  const step = useCallback(() => {
    const currentState = getState();

    if (!currentState.simulation) {
      throw new Error(
        "Cannot step simulation: No simulation initialized. Call initialize() first.",
      );
    }

    if (currentState.state === "Error") {
      throw new Error(
        "Cannot step simulation: Simulation is in error state. Please reset.",
      );
    }

    if (currentState.state === "Complete") {
      throw new Error(
        "Cannot step simulation: Simulation is complete. Please reset to run again.",
      );
    }

    try {
      const { simulation: updatedSimulation, transitionFired } =
        computeNextFrame(currentState.simulation);

      let newState: SimulationState =
        currentState.state === "Running" ? "Running" : "Paused";

      if (!transitionFired) {
        const currentFrame =
          updatedSimulation.frames[updatedSimulation.currentFrameNumber];
        if (currentFrame) {
          const enablementResult = checkTransitionEnablement(currentFrame);
          if (!enablementResult.hasEnabledTransition) {
            newState = "Complete";
          }
        }
      }

      setStateValues({
        ...currentState,
        simulation: updatedSimulation,
        state: newState,
        error: null,
        errorItemId: null,
        currentlyViewedFrame: updatedSimulation.currentFrameNumber,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error during simulation step:", error);

      setStateValues({
        ...currentState,
        state: "Error",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during step",
        errorItemId: error instanceof SDCPNItemError ? error.itemId : null,
      });
    }
  }, [getState]);

  // Auto-step when state is "Running"
  useEffect(() => {
    if (stateValues.state !== "Running") {
      return;
    }

    const timeoutId = setTimeout(() => {
      step();
    }, 20);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [step, stateValues.state, stateValues.simulation?.currentFrameNumber]);

  const run: SimulationContextValue["run"] = () => {
    const currentState = getState();

    if (currentState.state === "Running") {
      throw new Error("Cannot run simulation: Simulation is already running.");
    }

    if (!currentState.simulation) {
      throw new Error(
        "Cannot run simulation: No simulation initialized. Call initialize() first.",
      );
    }

    if (currentState.state === "Error") {
      throw new Error(
        "Cannot run simulation: Simulation is in error state. Please reset.",
      );
    }

    if (currentState.state === "Complete") {
      throw new Error(
        "Cannot run simulation: Simulation is complete. Please reset to run again.",
      );
    }

    setStateValues((prev) => ({ ...prev, state: "Running" }));
  };

  const pause: SimulationContextValue["pause"] = () => {
    setStateValues((prev) => ({ ...prev, state: "Paused" }));
  };

  const reset: SimulationContextValue["reset"] = () => {
    const sdcpn = getSDCPN();
    const defaultValues = deriveDefaultParameterValues(sdcpn.parameters);

    const parameterValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(defaultValues)) {
      parameterValues[key] = String(value);
    }

    setStateValues((prev) => ({
      ...prev,
      simulation: null,
      state: "NotRun",
      error: null,
      errorItemId: null,
      parameterValues,
      currentlyViewedFrame: 0,
      // Keep initialMarking when resetting - it's configuration, not simulation state
    }));
  };

  const setCurrentlyViewedFrame: SimulationContextValue["setCurrentlyViewedFrame"] =
    (frameIndex) => {
      setStateValues((prev) => {
        if (!prev.simulation) {
          throw new Error(
            "Cannot set viewed frame: No simulation initialized.",
          );
        }

        const totalFrames = prev.simulation.frames.length;
        const clampedIndex = Math.max(0, Math.min(frameIndex, totalFrames - 1));

        return { ...prev, currentlyViewedFrame: clampedIndex };
      });
    };

  const contextValue: SimulationContextValue = {
    ...stateValues,
    setInitialMarking,
    setParameterValue,
    setDt,
    initializeParameterValuesFromDefaults,
    initialize,
    run,
    pause,
    reset,
    setCurrentlyViewedFrame,
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      <SimulationStateNotifier />
      {children}
    </SimulationContext.Provider>
  );
};
