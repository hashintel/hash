import { use, useEffect, useRef, useState } from "react";
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

export {
  InitialMarking,
  SimulationContext,
  SimulationContextValue,
  SimulationState,
  useSimulationContext,
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

export type SimulationProviderProps = React.PropsWithChildren;

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
  const runTimeoutIdRef = useRef<number | null>(null);

  // Use refs to access latest state in callbacks
  const stateValuesRef = useRef(stateValues);
  useEffect(() => {
    stateValuesRef.current = stateValues;
  }, [stateValues]);

  const getSDCPN = () => sdcpnRef.current;
  const getState = () => stateValuesRef.current;

  const actions = {
    setInitialMarking: (
      placeId: string,
      marking: { values: Float64Array; count: number },
    ) =>
      setStateValues((prev) => {
        const newMarking = new Map(prev.initialMarking);
        newMarking.set(placeId, marking);
        return { ...prev, initialMarking: newMarking };
      }),

    setParameterValue: (parameterId: string, value: string) =>
      setStateValues((prev) => ({
        ...prev,
        parameterValues: {
          ...prev.parameterValues,
          [parameterId]: value,
        },
      })),

    setDt: (dt: number) => setStateValues((prev) => ({ ...prev, dt })),

    initializeParameterValuesFromDefaults: () =>
      setStateValues((prev) => {
        const sdcpn = getSDCPN();
        const defaultValues = deriveDefaultParameterValues(sdcpn.parameters);

        const parameterValues: Record<string, string> = {};
        for (const [key, value] of Object.entries(defaultValues)) {
          parameterValues[key] = String(value);
        }

        return { ...prev, parameterValues };
      }),

    initialize: ({ seed, dt }: { seed: number; dt: number }) =>
      setStateValues((prev) => {
        if (prev.state === "Running") {
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

            return {
              ...prev,
              simulation: null,
              state: "Error" as const,
              error: `TypeScript error in ${firstError.itemType} (${firstError.itemId}): ${errorMessage}`,
              errorItemId: firstError.itemId,
            };
          }

          // Build the simulation instance using stored initialMarking and parameterValues
          const simulationInstance = buildSimulation({
            sdcpn,
            initialMarking: prev.initialMarking,
            parameterValues: prev.parameterValues,
            seed,
            dt,
          });

          return {
            ...prev,
            simulation: simulationInstance,
            state: "Paused",
            error: null,
            errorItemId: null,
            currentlyViewedFrame: 0,
          };
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Error initializing simulation:", error);

          return {
            ...prev,
            simulation: null,
            state: "Error",
            error:
              error instanceof Error
                ? error.message
                : "Unknown error occurred during initialization",
            errorItemId: error instanceof SDCPNItemError ? error.itemId : null,
          };
        }
      }),

    step: () =>
      setStateValues((prev) => {
        if (!prev.simulation) {
          throw new Error(
            "Cannot step simulation: No simulation initialized. Call initialize() first.",
          );
        }

        if (prev.state === "Error") {
          throw new Error(
            "Cannot step simulation: Simulation is in error state. Please reset.",
          );
        }

        if (prev.state === "Complete") {
          throw new Error(
            "Cannot step simulation: Simulation is complete. Please reset to run again.",
          );
        }

        try {
          const { simulation: updatedSimulation, transitionFired } =
            computeNextFrame(prev.simulation);

          let newState: SimulationState =
            prev.state === "Running" ? "Running" : "Paused";

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

          return {
            ...prev,
            simulation: updatedSimulation,
            state: newState,
            error: null,
            errorItemId: null,
            currentlyViewedFrame: updatedSimulation.currentFrameNumber,
          };
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Error during simulation step:", error);

          return {
            ...prev,
            state: "Error",
            error:
              error instanceof Error
                ? error.message
                : "Unknown error occurred during step",
            errorItemId: error instanceof SDCPNItemError ? error.itemId : null,
          };
        }
      }),

    run: () => {
      const currentState = getState();

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

      // Clear any existing timeout
      if (runTimeoutIdRef.current !== null) {
        clearTimeout(runTimeoutIdRef.current);
      }

      // Set state to Running
      setStateValues((prev) => ({ ...prev, state: "Running" }));

      const executeStep = () => {
        const state = getState();
        if (state.state === "Running") {
          try {
            actions.step();
            // Continue running if still in Running state after step
            runTimeoutIdRef.current = setTimeout(() => {
              if (getState().state === "Running") {
                executeStep();
              }
            }, 0) as unknown as number;
          } catch {
            // Error is already handled by step()
          }
        }
      };

      runTimeoutIdRef.current = setTimeout(
        executeStep,
        20,
      ) as unknown as number;
    },

    pause: () => {
      if (runTimeoutIdRef.current !== null) {
        clearTimeout(runTimeoutIdRef.current);
        runTimeoutIdRef.current = null;
      }
      setStateValues((prev) => ({ ...prev, state: "Paused" }));
    },

    reset: () => {
      if (runTimeoutIdRef.current !== null) {
        clearTimeout(runTimeoutIdRef.current);
        runTimeoutIdRef.current = null;
      }

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
    },

    setState: (newState: SimulationState) =>
      setStateValues((prev) => {
        if (!prev.simulation && newState !== "NotRun") {
          throw new Error("Cannot change state: No simulation initialized.");
        }

        if (prev.state === "Error" && newState === "Running") {
          throw new Error(
            "Cannot start simulation: Simulation is in error state. Please reset.",
          );
        }

        if (prev.state === "Complete" && newState === "Running") {
          throw new Error(
            "Cannot start simulation: Simulation is complete. Please reset.",
          );
        }

        return { ...prev, state: newState };
      }),

    setCurrentlyViewedFrame: (frameIndex: number) =>
      setStateValues((prev) => {
        if (!prev.simulation) {
          throw new Error(
            "Cannot set viewed frame: No simulation initialized.",
          );
        }

        const totalFrames = prev.simulation.frames.length;
        const clampedIndex = Math.max(0, Math.min(frameIndex, totalFrames - 1));

        return { ...prev, currentlyViewedFrame: clampedIndex };
      }),

    __reinitialize: () => {
      if (runTimeoutIdRef.current !== null) {
        clearTimeout(runTimeoutIdRef.current);
        runTimeoutIdRef.current = null;
      }
      setStateValues(initialStateValues);
    },
  };

  // Reinitialize when petriNetId changes
  useEffect(() => {
    if (petriNetId) {
      actions.__reinitialize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only reinitialize when petriNetId changes
  }, [petriNetId]);

  const contextValue: SimulationContextValue = {
    ...stateValues,
    ...actions,
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      <SimulationStateNotifier />
      {children}
    </SimulationContext.Provider>
  );
};
