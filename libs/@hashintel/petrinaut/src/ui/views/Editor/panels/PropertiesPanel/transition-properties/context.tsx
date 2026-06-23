import { createContext, type ReactNode, use } from "react";

import type { PetrinautMutations } from "../../../../../../react";
import type {
  Color,
  Place,
  SDCPN,
  Transition,
  TransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

export type TransitionLogicNet = {
  places: Place[];
  componentInstances?: SDCPN["componentInstances"];
};

interface TransitionPropertiesContextValue {
  transition: Transition;
  sdcpn: SDCPN;
  net: TransitionLogicNet;
  places: Place[];
  types: Color[];
  logicAvailability: TransitionLogicAvailability;
  isReadOnly: boolean;
  updateTransition: PetrinautMutations["updateTransition"];
  onArcWeightUpdate: PetrinautMutations["updateArcWeight"];
  updateArcPlace: PetrinautMutations["updateArcPlace"];
  removeArc: PetrinautMutations["removeArc"];
}

const TransitionPropertiesContext =
  createContext<TransitionPropertiesContextValue | null>(null);

export const useTransitionPropertiesContext =
  (): TransitionPropertiesContextValue => {
    const context = use(TransitionPropertiesContext);
    if (!context) {
      throw new Error(
        "useTransitionPropertiesContext must be used within a TransitionPropertiesProvider",
      );
    }
    return context;
  };

interface TransitionPropertiesProviderProps {
  transition: Transition;
  sdcpn: SDCPN;
  net: TransitionLogicNet;
  places: Place[];
  types: Color[];
  logicAvailability: TransitionLogicAvailability;
  isReadOnly: boolean;
  updateTransition: PetrinautMutations["updateTransition"];
  onArcWeightUpdate: PetrinautMutations["updateArcWeight"];
  updateArcPlace: PetrinautMutations["updateArcPlace"];
  removeArc: PetrinautMutations["removeArc"];
  children: ReactNode;
}

export const TransitionPropertiesProvider: React.FC<
  TransitionPropertiesProviderProps
> = ({
  transition,
  sdcpn,
  net,
  places,
  types,
  logicAvailability,
  isReadOnly,
  updateTransition,
  onArcWeightUpdate,
  updateArcPlace,
  removeArc,
  children,
}) => {
  return (
    <TransitionPropertiesContext
      value={{
        transition,
        sdcpn,
        net,
        places,
        types,
        logicAvailability,
        isReadOnly,
        updateTransition,
        onArcWeightUpdate,
        updateArcPlace,
        removeArc,
      }}
    >
      {children}
    </TransitionPropertiesContext>
  );
};
