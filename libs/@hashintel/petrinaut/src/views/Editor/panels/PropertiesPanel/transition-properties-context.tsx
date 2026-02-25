import { createContext, type ReactNode, use } from "react";

import type { Color, Place, Transition } from "../../../../core/types/sdcpn";

interface TransitionPropertiesContextValue {
  transition: Transition;
  places: Place[];
  types: Color[];
  isReadOnly: boolean;
  updateTransition: (
    id: string,
    updateFn: (existingTransition: Transition) => void,
  ) => void;
  onArcWeightUpdate: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
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
  updateTransition: (
    id: string,
    updateFn: (existingTransition: Transition) => void,
  ) => void;
  onArcWeightUpdate: (
    transitionId: string,
    arcType: "input" | "output",
    placeId: string,
    weight: number,
  ) => void;
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
  children,
}) => {
  return (
    <TransitionPropertiesContext.Provider
      value={{
        transition,
        places,
        types,
        isReadOnly,
        updateTransition,
        onArcWeightUpdate,
      }}
    >
      {children}
    </TransitionPropertiesContext.Provider>
  );
};
