import { use } from "react";

import { SimulationContext } from "../simulation/context";
import { EditorContext } from "./editor-context";

/**
 * Hook that determines if the editor is in read-only mode.
 *
 * The editor is read-only when:
 * 1. The global mode is "simulate" (user has switched to simulation mode), OR
 * 2. A simulation is currently running, paused, or complete
 *
 * When read-only, structural changes to the SDCPN (places, transitions, arcs, etc.)
 * are prevented to maintain consistency with the simulation.
 */
export const useIsReadOnly = (): boolean => {
  const { globalMode } = use(EditorContext);
  const { state: simulationState } = use(SimulationContext);

  const isSimulationActive =
    simulationState === "Running" ||
    simulationState === "Paused" ||
    simulationState === "Complete";

  const isReadOnly = globalMode === "simulate" || isSimulationActive;
  return isReadOnly;
};
