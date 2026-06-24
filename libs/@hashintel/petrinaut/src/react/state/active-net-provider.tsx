import { use, useState, type ReactNode } from "react";

import { ActiveNetContext } from "./active-net-context";
import { SDCPNContext } from "./sdcpn-context";

/**
 * Derives the active net from the full SDCPN. When a subnet is active, editor
 * panels and canvas operations read that subnet's local places/transitions/etc.
 *
 * activeSubnetId is scoped to the current petriNetId: switching nets resets it
 * to null without a useEffect by storing the net id alongside the subnet id.
 */
export const ActiveNetProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { petriNetId, petriNetDefinition } = use(SDCPNContext);
  const [activeState, setActiveState] = useState<{
    petriNetId: string | null;
    subnetId: string | null;
  } | null>(null);

  // Effective subnet id: null if we've switched to a different net since it was set.
  const activeSubnetId =
    activeState?.petriNetId === petriNetId ? activeState.subnetId : null;

  const setActiveSubnetId = (subnetId: string | null) => {
    setActiveState({ petriNetId, subnetId });
  };

  const subnet =
    activeSubnetId !== null
      ? petriNetDefinition.subnets?.find(({ id }) => id === activeSubnetId)
      : undefined;

  const resolvedSubnetId = subnet ? activeSubnetId : null;

  const activeNet = subnet
    ? {
        places: subnet.places,
        transitions: subnet.transitions,
        types: subnet.types,
        differentialEquations: subnet.differentialEquations,
        parameters: subnet.parameters,
        componentInstances: subnet.componentInstances ?? [],
      }
    : {
        places: petriNetDefinition.places,
        transitions: petriNetDefinition.transitions,
        types: petriNetDefinition.types,
        differentialEquations: petriNetDefinition.differentialEquations,
        parameters: petriNetDefinition.parameters,
        componentInstances: petriNetDefinition.componentInstances ?? [],
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
