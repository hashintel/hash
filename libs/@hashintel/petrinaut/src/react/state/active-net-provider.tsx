import { use, useEffect, type ReactNode } from "react";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { openPetrinautSubnet, usePetrinautNavigation } from "../navigation";
import { ActiveNetContext } from "./active-net-context";
import { CompositionContext } from "./composition-context";
import { SDCPNContext } from "./sdcpn-context";

/**
 * Derives the active net from the full SDCPN. When a subnet is active, editor
 * panels and canvas operations read that subnet's local places/transitions/etc.
 *
 * activeSubnetId is part of Petrinaut's app location. Changing subnets clears
 * selection in the same atomic transition. The navigation provider is keyed
 * by document, so uncontrolled locations reset when the active handle changes.
 * A requested subnet id resolves through `toPetrinautId`, and the location is
 * rewritten to the canonical id, or to the root net when no subnet matches.
 * A component the host provides is a signature with no net to open, so its
 * id resolves to the root net too.
 */
export const ActiveNetProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { provided } = use(CompositionContext);
  const navigation = usePetrinautNavigation();
  const requestedSubnetId = navigation.state.subnetId;

  const setActiveSubnetId = (subnetId: string | null) => {
    navigation.navigate(openPetrinautSubnet(subnetId), {
      cause: "user",
      action: "subnet",
    });
  };

  const canonicalSubnetId =
    requestedSubnetId !== null ? toPetrinautId(requestedSubnetId) : null;
  const subnet =
    canonicalSubnetId !== null
      ? petriNetDefinition.subnets?.find(
          (candidate) =>
            candidate.id === canonicalSubnetId && !provided.has(candidate.id),
        )
      : undefined;

  const resolvedSubnetId = subnet ? canonicalSubnetId : null;

  useEffect(() => {
    if (requestedSubnetId !== null && requestedSubnetId !== resolvedSubnetId) {
      navigation.navigate(openPetrinautSubnet(resolvedSubnetId), {
        cause: "normalization",
        action: "subnet",
      });
    }
  }, [navigation, requestedSubnetId, resolvedSubnetId]);

  const activeNet = subnet
    ? {
        places: subnet.places,
        transitions: subnet.transitions,
        types: subnet.types,
        differentialEquations: subnet.differentialEquations,
        parameters: subnet.parameters,
        componentInstances: subnet.componentInstances ?? [],
        fusions: subnet.fusions ?? [],
      }
    : {
        places: petriNetDefinition.places,
        transitions: petriNetDefinition.transitions,
        types: petriNetDefinition.types,
        differentialEquations: petriNetDefinition.differentialEquations,
        parameters: petriNetDefinition.parameters,
        componentInstances: petriNetDefinition.componentInstances ?? [],
        fusions: petriNetDefinition.fusions ?? [],
      };

  return (
    <ActiveNetContext
      value={{
        activeNet,
        activeSubnetId: resolvedSubnetId,
        setActiveSubnetId,
      }}
    >
      {children}
    </ActiveNetContext>
  );
};
