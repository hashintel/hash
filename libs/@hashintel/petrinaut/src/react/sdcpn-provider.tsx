import { use, type ReactNode } from "react";

import {
  ARC_ID_PREFIX,
  SDCPNContext,
  type SDCPNContextValue,
} from "../state/sdcpn-context";
import { NetManagementContext } from "./net-management-context";
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

  const value: SDCPNContextValue = {
    petriNetId: instance.handle.id,
    petriNetDefinition,
    readonly: instance.readonly,
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

      if (petriNetDefinition.types.some((type) => type.id === id)) {
        return "type";
      }

      if (
        petriNetDefinition.parameters.some((parameter) => parameter.id === id)
      ) {
        return "parameter";
      }

      if (
        petriNetDefinition.differentialEquations.some(
          (equation) => equation.id === id,
        )
      ) {
        return "differentialEquation";
      }

      if (petriNetDefinition.places.some((place) => place.id === id)) {
        return "place";
      }

      if (
        petriNetDefinition.transitions.some(
          (transition) => transition.id === id,
        )
      ) {
        return "transition";
      }

      return null;
    },
  };

  return (
    <SDCPNContext.Provider value={value}>{children}</SDCPNContext.Provider>
  );
};
