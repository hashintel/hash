import { createContext, use } from "react";

import type {
  Color,
  Transition,
  TransitionLogicAvailability,
} from "@hashintel/petrinaut-core";

interface TransitionPropertiesContextValue {
  transition: Transition;
  types: Color[];
  logicAvailability: TransitionLogicAvailability;
}

export const TransitionPropertiesContext =
  createContext<TransitionPropertiesContextValue | null>(null);

export const useTransitionPropertiesContext =
  (): TransitionPropertiesContextValue => {
    const context = use(TransitionPropertiesContext);
    if (!context) {
      throw new Error(
        "useTransitionPropertiesContext must be used within TransitionProperties",
      );
    }
    return context;
  };
