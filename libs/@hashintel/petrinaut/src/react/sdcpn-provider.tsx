import { use, type ReactNode } from "react";

import {
  ARC_ID_PREFIX,
  isSelectionTypeAvailableForExtensions,
  WIRE_ID_PREFIX,
} from "@hashintel/petrinaut-core";

import { NetManagementContext } from "./net-management-context";
import { SDCPNContext, type SDCPNContextValue } from "./state/sdcpn-context";
import { usePetrinautInstance } from "./use-petrinaut-instance";
import { useStore } from "./use-store";

/**
 * Bridge: reads document state from the Core instance and net-management info
 * from {@link NetManagementContext}, republishes through the existing
 * {@link SDCPNContext} so `/ui` consumers don't change.
 */
export const SDCPNProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const instance = usePetrinautInstance();
  const netManagement = use(NetManagementContext);

  const petriNetDefinition = useStore(instance.definition);
  const allNets = [petriNetDefinition, ...(petriNetDefinition.subnets ?? [])];

  const value: SDCPNContextValue = {
    petriNetId: instance.handle.id,
    petriNetDefinition,
    readonly: instance.readonly,
    extensions: instance.extensions,
    title: netManagement.title,
    setTitle: netManagement.setTitle,
    existingNets: netManagement.existingNets,
    createNewNet: netManagement.createNewNet,
    loadPetriNet: netManagement.loadPetriNet,
    getItemType(id) {
      // TODO: Selection and elements IDs should be reworked
      if (id.startsWith(ARC_ID_PREFIX)) {
        return "arc";
      }

      if (
        isSelectionTypeAvailableForExtensions("type", instance.extensions) &&
        allNets.some((net) => net.types.some((type) => type.id === id))
      ) {
        return "type";
      }

      if (id.startsWith(WIRE_ID_PREFIX)) {
        return "wire";
      }

      if (
        isSelectionTypeAvailableForExtensions(
          "parameter",
          instance.extensions,
        ) &&
        allNets.some((net) =>
          net.parameters.some((parameter) => parameter.id === id),
        )
      ) {
        return "parameter";
      }

      if (
        isSelectionTypeAvailableForExtensions(
          "differentialEquation",
          instance.extensions,
        ) &&
        allNets.some((net) =>
          net.differentialEquations.some((equation) => equation.id === id),
        )
      ) {
        return "differentialEquation";
      }

      if (allNets.some((net) => net.places.some((place) => place.id === id))) {
        return "place";
      }

      if (
        allNets.some((net) =>
          net.transitions.some((transition) => transition.id === id),
        )
      ) {
        return "transition";
      }

      if (
        allNets.some((net) =>
          (net.componentInstances ?? []).some((item) => item.id === id),
        )
      ) {
        return "componentInstance";
      }

      return null;
    },
  };

  return (
    <SDCPNContext.Provider value={value}>{children}</SDCPNContext.Provider>
  );
};
