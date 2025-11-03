import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { buildSimulation } from "../../core/build-simulation";
import { executeTransitions } from "../../core/helpers/execute-transitions";
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

  // Initialize the simulation with initial marking
  initialize: (params: {
    initialMarking: InitialMarking;
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

        initialize: ({ initialMarking, seed, dt }) =>
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

                // Build the simulation instance
                const simulationInstance = buildSimulation({
                  sdcpn,
                  initialMarking,
                  seed,
                  dt,
                });

                return {
                  simulation: simulationInstance,
                  state: "Paused",
                  error: null,
                };
              } catch (error) {
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
                const currentFrame =
                  state.simulation.frames[state.simulation.currentFrameNumber]!;

                // Execute transitions to get the next frame
                const nextFrame = executeTransitions(currentFrame);

                // Create updated simulation instance with new frame
                const updatedSimulation: SimulationInstance = {
                  ...state.simulation,
                  frames: [...state.simulation.frames, nextFrame],
                  currentFrameNumber: state.simulation.currentFrameNumber + 1,
                };

                return {
                  simulation: updatedSimulation,
                  state: state.state === "Running" ? "Running" : "Paused",
                  error: null,
                };
              } catch (error) {
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
