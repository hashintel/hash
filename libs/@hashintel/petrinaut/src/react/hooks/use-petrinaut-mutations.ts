import { use } from "react";

import { PetrinautInstanceContext } from "../instance-context";
import { ActiveNetContext } from "../state/active-net-context";
import { SDCPNContext } from "../state/sdcpn-context";
import { simulateModeAllowedMutationNames } from "../state/simulate-mode-allowed-mutation-names";
import { useIsReadOnly } from "../state/use-is-read-only";

import type { PetrinautMutations } from "@hashintel/petrinaut-core";

type PetrinautMutationInput<Name extends keyof PetrinautMutations> = Parameters<
  PetrinautMutations[Name]
>[0];

/**
 * React-facing bundle of atomic SDCPN mutations.
 *
 * Each helper is wrapped so that:
 *
 * - Most mutations no-op when {@link useIsReadOnly} returns `true` (host
 *   `readonly`, simulate mode, or an active simulation).
 * - Scenario/metric mutations only check the host `readonly` flag — they
 *   remain available in simulate mode where the Simulate panel manages them.
 *   The list lives in {@link simulateModeAllowedMutationNames} so the AI
 *   tool dispatcher stays in sync.
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
  const { activeSubnetId } = use(ActiveNetContext);
  const isReadOnly = useIsReadOnly();
  const { mutations } = instance;

  const withReadonlyGuard = <Name extends keyof PetrinautMutations>(
    name: Name,
    options?: { targetActiveSubnet?: boolean },
  ): PetrinautMutations[Name] => {
    const allowedInSimulate = simulateModeAllowedMutationNames.has(name);
    const target = mutations[name] as (
      input: PetrinautMutationInput<Name>,
    ) => void;
    const wrapped = ((input: PetrinautMutationInput<Name>) => {
      if (allowedInSimulate ? readonly : isReadOnly) {
        return;
      }
      const nextInput =
        options?.targetActiveSubnet === false
          ? input
          : ({
              ...input,
              targetSubnetId: activeSubnetId,
            } as PetrinautMutationInput<Name>);
      target(nextInput);
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
    addScenario: withReadonlyGuard("addScenario", {
      targetActiveSubnet: false,
    }),
    updateScenario: withReadonlyGuard("updateScenario", {
      targetActiveSubnet: false,
    }),
    removeScenario: withReadonlyGuard("removeScenario", {
      targetActiveSubnet: false,
    }),
    addMetric: withReadonlyGuard("addMetric", { targetActiveSubnet: false }),
    updateMetric: withReadonlyGuard("updateMetric", {
      targetActiveSubnet: false,
    }),
    removeMetric: withReadonlyGuard("removeMetric", {
      targetActiveSubnet: false,
    }),
    addSubnet: withReadonlyGuard("addSubnet", { targetActiveSubnet: false }),
    updateSubnet: withReadonlyGuard("updateSubnet", {
      targetActiveSubnet: false,
    }),
    removeSubnet: withReadonlyGuard("removeSubnet", {
      targetActiveSubnet: false,
    }),
    addComponentInstance: withReadonlyGuard("addComponentInstance"),
    updateComponentInstance: withReadonlyGuard("updateComponentInstance"),
    updateComponentInstancePosition: withReadonlyGuard(
      "updateComponentInstancePosition",
    ),
    removeComponentInstance: withReadonlyGuard("removeComponentInstance"),
    deleteItemsByIds: withReadonlyGuard("deleteItemsByIds"),
    commitNodePositions: withReadonlyGuard("commitNodePositions"),
  };
}
