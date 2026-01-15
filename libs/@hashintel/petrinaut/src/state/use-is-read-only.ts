import { use } from "react";

import { useEditorStore } from "./editor-provider";
import { SimulationContext } from "./simulation-provider";

/**
 * Hook that determines if the editor is in read-only mode.
 *
 * The editor is read-only when:
 * 1. The global mode is "simulate" (user has switched to simulation mode), OR
 * 2. A simulation is currently running or paused (has been initialized)
 *
 * When read-only, structural changes to the SDCPN (places, transitions, arcs, etc.)
 * are prevented to maintain consistency with the running simulation.
 */
export const useIsReadOnly = (): boolean => {
  const globalMode = useEditorStore((state) => state.globalMode);
  const { state: simulationState } = use(SimulationContext);

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  const isReadOnly = globalMode === "simulate" || isSimulationActive;
  return isReadOnly;
};
