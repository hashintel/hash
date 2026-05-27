import type { PetrinautMutations } from "@hashintel/petrinaut-core";

/**
 * Mutations remain available in simulate mode.
 * Only the host `readonly` flag blocks them —
 * neither a `globalMode === "simulate"` switch
 * nor an active simulation (Running / Paused / Complete) disables them
 */
export const simulateModeAllowedMutationNames = new Set<
  keyof PetrinautMutations
>([
  "addScenario",
  "updateScenario",
  "removeScenario",
  "addMetric",
  "updateMetric",
  "removeMetric",
]);
