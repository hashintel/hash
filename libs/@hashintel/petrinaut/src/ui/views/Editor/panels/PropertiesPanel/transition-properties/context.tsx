import { createContext, type ReactNode, use } from "react";

import type { PetrinautMutations } from "../../../../../../react";
import type { Color, Place, Transition } from "@hashintel/petrinaut-core";

interface TransitionPropertiesContextValue {
  transition: Transition;
  places: Place[];
  types: Color[];
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
  places: Place[];
  types: Color[];
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
  places,
  types,
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
        places,
        types,
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
