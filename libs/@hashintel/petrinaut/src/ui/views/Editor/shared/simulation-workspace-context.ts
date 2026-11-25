import { createContext, use } from "react";

export const SimulationWorkspaceContext = createContext<
  HTMLElement | null | undefined
>(undefined);

/** The element a simulation panel renders into: `undefined` outside a workspace, `null` until it has mounted. */
export const useSimulationWorkspaceContainer = () =>
  use(SimulationWorkspaceContext);
