import { use } from "react";

import { SimulationContext } from "../simulation/context";
import { EditorContext } from "./editor-context";
import { SDCPNContext } from "./sdcpn-context";

/**
 * Hook that determines if the editor is in read-only mode.
 *
 * The editor is read-only when any of the following are true:
 * 1. The external `readonly` prop is set by the consumer
 * 2. The global mode is "simulate" (user has switched to simulation mode)
 * 3. A simulation is currently running, paused, or complete
 *
 * When read-only, structural changes to the SDCPN (places, transitions, arcs, etc.)
 * are prevented.
 */
export const useIsReadOnly = (): boolean => {
  const { readonly } = use(SDCPNContext);
  const { globalMode } = use(EditorContext);
  const { state: simulationState } = use(SimulationContext);

  const isSimulationActive =
    simulationState === "Running" ||
    simulationState === "Paused" ||
    simulationState === "Complete";

  return readonly || globalMode === "simulate" || isSimulationActive;
};
