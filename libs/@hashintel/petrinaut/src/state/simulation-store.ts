import ts from "typescript";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { checkSDCPN } from "../core/checker/checker";
import { SDCPNItemError } from "../core/errors";
import { buildSimulation } from "../core/simulation/build-simulation";
import { computeNextFrame } from "../core/simulation/compute-next-frame";
import type { SDCPN } from "../core/types/sdcpn";
import type { SimulationInstance } from "../core/types/simulation";
import { deriveDefaultParameterValues } from "../hooks/use-default-parameter-values";

export type SimulationState =
  | "NotRun"
  | "Running"
  | "Complete"
  | "Error"
  | "Paused";

export type InitialMarking = Map<
  string,
  { values: Float64Array; count: number }
>;

export type SimulationStoreState = {
  // The current simulation instance (null when NotRun)
  simulation: SimulationInstance | null;

  // Current state of the simulation
  state: SimulationState;

  // Error message if state is Error
  error: string | null;

  // Item ID associated with the error (for jumping to the problematic item)
  errorItemId: string | null;

  // Parameter values for the simulation (key: parameter ID, value: parameter value)
  parameterValues: Record<string, string>;

  // Initial marking for the simulation (stored separately from SDCPN definition)
  // Maps place ID to initial token data
  initialMarking: InitialMarking;

  // The currently viewed frame index (for timeline scrubbing)
  currentlyViewedFrame: number;

  // Time step for the simulation (dt)
  dt: number;

  // Internal timeout ID for the run loop (not exposed to consumers)
  _runTimeoutId: number | null;

  // Set initial marking for a specific place
  setInitialMarking: (
    placeId: string,
    marking: { values: Float64Array; count: number },
  ) => void;

  // Set a parameter value
  setParameterValue: (parameterId: string, value: string) => void;

  // Set the time step (dt) for the simulation
  setDt: (dt: number) => void;

  // Initialize parameter values from SDCPN defaults (useful when switching to simulation mode)
  initializeParameterValuesFromDefaults: () => void;

  // Initialize the simulation with seed and dt (uses stored initialMarking)
  initialize: (params: {
    seed: number;
    dt: number;
  }) => void;

  // Advance the simulation by one frame
  step: () => void;

  // Run the simulation continuously (executes step in a loop)
  run: () => void;

  // Pause the simulation (stops the run loop)
  pause: () => void;

  // Reset the simulation to NotRun state
  reset: () => void;

  // Set the simulation state to Running or Paused
  setState: (state: SimulationState) => void;

  // Set the currently viewed frame (for timeline scrubbing)
  setCurrentlyViewedFrame: (frameIndex: number) => void;

  __reinitialize: () => void;
};

/**
 * Creates a Zustand store for managing simulation execution.
 * This store manages the simulation instance and execution state.
 */
export function createSimulationStore(getSDCPN: () => { sdcpn: SDCPN }) {
  const store = create<SimulationStoreState>()(
    devtools(
      (set, get) =>
        ({
          simulation: null,
          state: "NotRun",
          error: null,
          errorItemId: null,
          parameterValues: {},
          initialMarking: new Map(),
          currentlyViewedFrame: 0,
          dt: 0.01, // Default time step
          _runTimeoutId: null,

          setInitialMarking: (placeId, marking) =>
            set(
              (state) => {
                const newMarking = new Map(state.initialMarking);
                newMarking.set(placeId, marking);
                return { initialMarking: newMarking };
              },
              false,
              { type: "setInitialMarking", placeId, marking },
            ),

          setParameterValue: (parameterId, value) =>
            set(
              (state) => ({
                parameterValues: {
                  ...state.parameterValues,
                  [parameterId]: value,
                },
              }),
              false,
              { type: "setParameterValue", parameterId, value },
            ),

          setDt: (dt) => set({ dt }, false, { type: "setDt", dt }),

          initializeParameterValuesFromDefaults: () =>
            set(
              () => {
                const { sdcpn } = getSDCPN();
                const defaultValues = deriveDefaultParameterValues(
                  sdcpn.parameters,
                );

                // Convert to string format for storage (matching the parameterValues type)
                const parameterValues: Record<string, string> = {};
                for (const [key, value] of Object.entries(defaultValues)) {
                  parameterValues[key] = String(value);
                }

                return { parameterValues };
              },
              false,
              "initializeParameterValuesFromDefaults",
            ),

          initialize: ({ seed, dt }) =>
            set(
              (state) => {
                // Prevent initialization if already running
                if (state.state === "Running") {
                  throw new Error(
                    "Cannot initialize simulation while it is running. Please reset first.",
                  );
                }

                try {
                  const { sdcpn } = getSDCPN();

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
                      simulation: null,
                      state: "Error" as const,
                      error: `TypeScript error in ${firstError.itemType} (${firstError.itemId}): ${errorMessage}`,
                      errorItemId: firstError.itemId,
                    };
                  }

                  // Build the simulation instance using stored initialMarking
                  const simulationInstance = buildSimulation({
                    sdcpn,
                    initialMarking: state.initialMarking,
                    seed,
                    dt,
                  });

                  return {
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
                    simulation: null,
                    state: "Error",
                    error:
                      error instanceof Error
                        ? error.message
                        : "Unknown error occurred during initialization",
                    errorItemId:
                      error instanceof SDCPNItemError ? error.itemId : null,
                  };
                }
              },
              false,
              "initialize",
            ),

          step: () =>
            set(
              (state) => {
                if (!state.simulation) {
                  throw new Error(
                    "Cannot step simulation: No simulation initialized. Call initialize() first.",
                  );
                }

                if (state.state === "Error") {
                  throw new Error(
                    "Cannot step simulation: Simulation is in error state. Please reset.",
                  );
                }

                if (state.state === "Complete") {
                  throw new Error(
                    "Cannot step simulation: Simulation is complete. Please reset to run again.",
                  );
                }

                try {
                  // Compute the next frame (applies dynamics + transitions)
                  const updatedSimulation = computeNextFrame(state.simulation);

                  return {
                    simulation: updatedSimulation,
                    state: state.state === "Running" ? "Running" : "Paused",
                    error: null,
                    errorItemId: null,
                    currentlyViewedFrame: updatedSimulation.currentFrameNumber,
                  };
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error("Error during simulation step:", error);

                  return {
                    state: "Error",
                    error:
                      error instanceof Error
                        ? error.message
                        : "Unknown error occurred during step",
                    errorItemId:
                      error instanceof SDCPNItemError ? error.itemId : null,
                  };
                }
              },
              false,
              "step",
            ),

          run: () =>
            set(
              (state) => {
                if (!state.simulation) {
                  throw new Error(
                    "Cannot run simulation: No simulation initialized. Call initialize() first.",
                  );
                }

                if (state.state === "Error") {
                  throw new Error(
                    "Cannot run simulation: Simulation is in error state. Please reset.",
                  );
                }

                if (state.state === "Complete") {
                  throw new Error(
                    "Cannot run simulation: Simulation is complete. Please reset to run again.",
                  );
                }

                // Clear any existing timeout
                if (state._runTimeoutId !== null) {
                  clearTimeout(state._runTimeoutId);
                }

                // Set state to Running and schedule the first step
                if (state.state !== "Running") {
                  const executeStep = () => {
                    const currentState = get();
                    if (currentState.state === "Running") {
                      try {
                        currentState.step();
                        // Continue running if still in Running state after step
                        const timeoutId = setTimeout(() => {
                          if (get().state === "Running") {
                            executeStep();
                          }
                        }, 0) as unknown as number;

                        // Store the timeout ID
                        set(
                          { _runTimeoutId: timeoutId },
                          false,
                          "run:scheduleNext",
                        );
                      } catch {
                        // Error is already handled by step()
                      }
                    }
                  };

                  const initialTimeoutId = setTimeout(
                    executeStep,
                    20,
                  ) as unknown as number;
                  return { state: "Running", _runTimeoutId: initialTimeoutId };
                }

                return { state: "Running" };
              },
              false,
              "run",
            ),

          pause: () =>
            set(
              (state) => {
                // Clear the timeout if one exists
                if (state._runTimeoutId !== null) {
                  clearTimeout(state._runTimeoutId);
                }

                return {
                  state: "Paused",
                  _runTimeoutId: null,
                };
              },
              false,
              "pause",
            ),

          reset: () =>
            set(
              (state) => {
                // Clear the timeout if one exists
                if (state._runTimeoutId !== null) {
                  clearTimeout(state._runTimeoutId);
                }

                // Get default parameter values from SDCPN
                const { sdcpn } = getSDCPN();
                const defaultValues = deriveDefaultParameterValues(
                  sdcpn.parameters,
                );

                // Convert to string format for storage
                const parameterValues: Record<string, string> = {};
                for (const [key, value] of Object.entries(defaultValues)) {
                  parameterValues[key] = String(value);
                }

                return {
                  simulation: null,
                  state: "NotRun",
                  error: null,
                  errorItemId: null,
                  parameterValues,
                  currentlyViewedFrame: 0,
                  _runTimeoutId: null,
                  // Keep initialMarking when resetting - it's configuration, not simulation state
                };
              },
              false,
              "reset",
            ),

          setState: (newState) =>
            set(
              (state) => {
                // Validate state transitions
                if (!state.simulation && newState !== "NotRun") {
                  throw new Error(
                    "Cannot change state: No simulation initialized.",
                  );
                }

                if (state.state === "Error" && newState === "Running") {
                  throw new Error(
                    "Cannot start simulation: Simulation is in error state. Please reset.",
                  );
                }

                if (state.state === "Complete" && newState === "Running") {
                  throw new Error(
                    "Cannot start simulation: Simulation is complete. Please reset.",
                  );
                }

                return { state: newState };
              },
              false,
              { type: "setState", newState },
            ),

          setCurrentlyViewedFrame: (frameIndex) =>
            set(
              (state) => {
                if (!state.simulation) {
                  throw new Error(
                    "Cannot set viewed frame: No simulation initialized.",
                  );
                }

                const totalFrames = state.simulation.frames.length;
                const clampedIndex = Math.max(
                  0,
                  Math.min(frameIndex, totalFrames - 1),
                );

                return { currentlyViewedFrame: clampedIndex };
              },
              false,
              { type: "setCurrentlyViewedFrame", frameIndex },
            ),

          __reinitialize: () => {
            clearTimeout(get()._runTimeoutId!);
            set(
              {
                simulation: null,
                state: "NotRun",
                error: null,
                currentlyViewedFrame: 0,
                _runTimeoutId: null,
              },
              false,
              "reinitialize",
            );
          },
          // for some reason 'create' doesn't raise an error if a function in the type is missing
        }) satisfies SimulationStoreState,
      { name: "Simulation Store" },
    ),
  );

  return store;
}
