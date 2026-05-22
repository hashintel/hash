import { use } from "react";

import type { PetrinautMutations } from "@hashintel/petrinaut-core";

import { PetrinautInstanceContext } from "../instance-context";
import { SDCPNContext } from "../state/sdcpn-context";
import { useIsReadOnly } from "../state/use-is-read-only";

/**
 * Names of mutations that are allowed in simulate mode. Scenario and metric
 * CRUD are managed from the Simulate panel — only the host `readonly` flag
 * blocks them.
 */
const SCENARIO_MUTATION_NAMES = new Set<keyof PetrinautMutations>([
  "addScenario",
  "updateScenario",
  "removeScenario",
  "addMetric",
  "updateMetric",
  "removeMetric",
]);

/**
 * React-facing bundle of atomic SDCPN mutations.
 *
 * Each helper is wrapped so that:
 *
 * - Most mutations no-op when {@link useIsReadOnly} returns `true` (host
 *   `readonly`, simulate mode, or an active simulation).
 * - Scenario/metric mutations only check the host `readonly` flag — they
 *   remain available in simulate mode where the Simulate panel manages them.
 *
 * Components MUST NOT reach for `usePetrinautInstance().mutations` directly;
 * the public `usePetrinautInstance()` return type narrows away the mutation
 * surface to keep the readonly guard centralised in this hook.
 */
export function usePetrinautMutations(): PetrinautMutations {
  const instance = use(PetrinautInstanceContext);
  if (!instance) {
    throw new Error(
      "usePetrinautMutations must be used inside <PetrinautProvider> (or <Petrinaut>).",
    );
  }
  const { readonly } = use(SDCPNContext);
  const isReadOnly = useIsReadOnly();
  const { mutations } = instance;

  const withReadonlyGuard = <Name extends keyof PetrinautMutations>(
    name: Name,
  ): PetrinautMutations[Name] => {
    const allowedInSimulate = SCENARIO_MUTATION_NAMES.has(name);
    const target = mutations[name] as (input: never) => void;
    const wrapped = ((input: never) => {
      if (allowedInSimulate ? readonly : isReadOnly) {
        return;
      }
      target(input);
    }) as PetrinautMutations[Name];
    return wrapped;
  };

  return {
    addPlace: withReadonlyGuard("addPlace"),
    updatePlace: withReadonlyGuard("updatePlace"),
    updatePlacePosition: withReadonlyGuard("updatePlacePosition"),
    removePlace: withReadonlyGuard("removePlace"),
    addTransition: withReadonlyGuard("addTransition"),
    updateTransition: withReadonlyGuard("updateTransition"),
    updateTransitionPosition: withReadonlyGuard("updateTransitionPosition"),
    removeTransition: withReadonlyGuard("removeTransition"),
    addArc: withReadonlyGuard("addArc"),
    removeArc: withReadonlyGuard("removeArc"),
    updateArcWeight: withReadonlyGuard("updateArcWeight"),
    updateArcType: withReadonlyGuard("updateArcType"),
    updateArcPlace: withReadonlyGuard("updateArcPlace"),
    addType: withReadonlyGuard("addType"),
    updateType: withReadonlyGuard("updateType"),
    removeType: withReadonlyGuard("removeType"),
    addTypeElement: withReadonlyGuard("addTypeElement"),
    updateTypeElement: withReadonlyGuard("updateTypeElement"),
    removeTypeElement: withReadonlyGuard("removeTypeElement"),
    moveTypeElement: withReadonlyGuard("moveTypeElement"),
    addDifferentialEquation: withReadonlyGuard("addDifferentialEquation"),
    updateDifferentialEquation: withReadonlyGuard("updateDifferentialEquation"),
    removeDifferentialEquation: withReadonlyGuard("removeDifferentialEquation"),
    addParameter: withReadonlyGuard("addParameter"),
    updateParameter: withReadonlyGuard("updateParameter"),
    removeParameter: withReadonlyGuard("removeParameter"),
    addScenario: withReadonlyGuard("addScenario"),
    updateScenario: withReadonlyGuard("updateScenario"),
    removeScenario: withReadonlyGuard("removeScenario"),
    addMetric: withReadonlyGuard("addMetric"),
    updateMetric: withReadonlyGuard("updateMetric"),
    removeMetric: withReadonlyGuard("removeMetric"),
    deleteItemsByIds: withReadonlyGuard("deleteItemsByIds"),
    commitNodePositions: withReadonlyGuard("commitNodePositions"),
  };
}
