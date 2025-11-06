import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { buildSimulation } from "../../core/build-simulation";
import { computeNextFrame } from "../../core/helpers/compute-next-frame";
import type { SimulationInstance } from "../../core/types/simulation";
import type { SDCPNState } from "./sdcpn-store";

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

  // Parameter values for the simulation (key: parameter ID, value: parameter value)
  parameterValues: Record<string, string>;

  // Initial marking for the simulation (stored separately from SDCPN definition)
  // Maps place ID to initial token data
  initialMarking: InitialMarking;

  // Set initial marking for a specific place
  setInitialMarking: (
    placeId: string,
    marking: { values: Float64Array; count: number },
  ) => void;

  // Set a parameter value
  setParameterValue: (parameterId: string, value: string) => void;

  // Initialize the simulation with seed and dt (uses stored initialMarking)
  initialize: (params: {
    seed: number;
    dt: number;
  }) => void;

  // Advance the simulation by one frame
  step: () => void;

  // Reset the simulation to NotRun state
  reset: () => void;

  // Set the simulation state to Running or Paused
  setState: (state: SimulationState) => void;
};

/**
 * Creates a Zustand store for managing simulation execution.
 * This store manages the simulation instance and execution state.
 */
export function createSimulationStore(sdcpnStore: {
  getState: () => SDCPNState;
}) {
  return create<SimulationStoreState>()(
    devtools(
      (set) => ({
        simulation: null,
        state: "NotRun",
        error: null,
        parameterValues: {},
        initialMarking: new Map(),

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
                const { sdcpn } = sdcpnStore.getState();

                // eslint-disable-next-line no-console
                console.log("Initializing simulation with:", {
                  sdcpn,
                  initialMarking: state.initialMarking,
                  seed,
                  dt,
                });

                // Build the simulation instance using stored initialMarking
                const simulationInstance = buildSimulation({
                  sdcpn,
                  initialMarking: state.initialMarking,
                  seed,
                  dt,
                });

                // eslint-disable-next-line no-console
                console.log(
                  "Simulation initialized successfully:",
                  simulationInstance,
                );

                return {
                  simulation: simulationInstance,
                  state: "Paused",
                  error: null,
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

                const nextFrame =
                  updatedSimulation.frames[updatedSimulation.currentFrameNumber]!;

                // eslint-disable-next-line no-console
                console.log("Next frame generated:", nextFrame);
                // eslint-disable-next-line no-console
                console.log("Frame buffer:", nextFrame.buffer);

                return {
                  simulation: updatedSimulation,
                  state: state.state === "Running" ? "Running" : "Paused",
                  error: null,
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
                };
              }
            },
            false,
            "step",
          ),

        reset: () =>
          set(
            {
              simulation: null,
              state: "NotRun",
              error: null,
              parameterValues: {},
              // Keep initialMarking when resetting - it's configuration, not simulation state
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
      }),
      { name: "Simulation Store" },
    ),
  );
}
