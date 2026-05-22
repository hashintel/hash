import { createContext, type ReactNode, use } from "react";

import type { MutationContextValue } from "../../../../../../react/state/mutation-context";
import type { Color, Place, Transition } from "@hashintel/petrinaut-core";

interface TransitionPropertiesContextValue {
  transition: Transition;
  places: Place[];
  types: Color[];
  isReadOnly: boolean;
  updateTransition: MutationContextValue["updateTransition"];
  onArcWeightUpdate: MutationContextValue["updateArcWeight"];
  updateArcPlace: MutationContextValue["updateArcPlace"];
  removeArc: MutationContextValue["removeArc"];
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
  updateTransition: MutationContextValue["updateTransition"];
  onArcWeightUpdate: MutationContextValue["updateArcWeight"];
  updateArcPlace: MutationContextValue["updateArcPlace"];
  removeArc: MutationContextValue["removeArc"];
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
