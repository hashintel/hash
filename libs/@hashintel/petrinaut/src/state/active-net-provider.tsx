import { use, useState } from "react";

import {
  ActiveNetContext,
  type ActiveNetContextValue,
} from "./active-net-context";
import { SDCPNContext } from "./sdcpn-context";

/**
 * Derives the active net from the full SDCPN based on `activeSubnetId`.
 *
 * When `activeSubnetId` is null the root net is active.
 * When it points to a subnet, that subnet's definition is exposed instead.
 * If the selected subnet no longer exists (e.g. it was deleted), falls back to root.
 */
export const ActiveNetProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const [activeSubnetId, setActiveSubnetId] = useState<string | null>(null);

  const subnet =
    activeSubnetId !== null
      ? petriNetDefinition.subnets?.find((s) => s.id === activeSubnetId)
      : undefined;

  // Fall back to root if the subnet was deleted
  const resolvedSubnetId = subnet ? activeSubnetId : null;

  const activeNet = subnet ?? {
    places: petriNetDefinition.places,
    transitions: petriNetDefinition.transitions,
    types: petriNetDefinition.types,
    differentialEquations: petriNetDefinition.differentialEquations,
    parameters: petriNetDefinition.parameters,
  };

  const value: ActiveNetContextValue = {
    activeNet,
    activeSubnetId: resolvedSubnetId,
    setActiveSubnetId,
  };

  return <ActiveNetContext value={value}>{children}</ActiveNetContext>;
};
