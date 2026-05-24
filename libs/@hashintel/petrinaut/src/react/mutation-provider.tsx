import { use, type ReactNode } from "react";

import { MutationContext, type MutationContextValue } from "./state/mutation-context";
import { SDCPNContext } from "./state/sdcpn-context";
import { useIsReadOnly } from "./state/use-is-read-only";
import { usePetrinautInstance } from "./use-petrinaut-instance";

/**
 * Provides the mutation context surface, delegating all writes to the Core
 * instance's actions. Read-only checks honour the editor mode (which lives in
 * `EditorContext`) — only `readonly` blocks scenario mutations.
 */
export const MutationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const instance = usePetrinautInstance();
  const { readonly } = use(SDCPNContext);
  const isReadOnly = useIsReadOnly();

  function guardedMutate(callback: () => void): void {
    if (isReadOnly) {
      return;
    }
    callback();
  }

  /**
   * Scenario CRUD is allowed even in simulate mode (the Simulate panel is
   * where scenarios are managed). Only true `readonly` blocks them.
   */
  function scenarioMutate(callback: () => void): void {
    if (readonly) {
      return;
    }
    callback();
  }

  const value: MutationContextValue = {
    addPlace(place) {
      guardedMutate(() => {
        instance.addPlace(place);
      });
    },
    updatePlace(input) {
      guardedMutate(() => {
        instance.updatePlace(input);
      });
    },
    updatePlacePosition(input) {
      guardedMutate(() => {
        instance.updatePlacePosition(input);
      });
    },
    removePlace(input) {
      guardedMutate(() => {
        instance.removePlace(input);
      });
    },
    addTransition(transition) {
      guardedMutate(() => {
        instance.addTransition(transition);
      });
    },
    updateTransition(input) {
      guardedMutate(() => {
        instance.updateTransition(input);
      });
    },
    updateTransitionPosition(input) {
      guardedMutate(() => {
        instance.updateTransitionPosition(input);
      });
    },
    removeTransition(input) {
      guardedMutate(() => {
        instance.removeTransition(input);
      });
    },
    addArc(input) {
      guardedMutate(() => {
        instance.addArc(input);
      });
    },
    removeArc(input) {
      guardedMutate(() => {
        instance.removeArc(input);
      });
    },
    updateArcWeight(input) {
      guardedMutate(() => {
        instance.updateArcWeight(input);
      });
    },
    updateArcType(input) {
      guardedMutate(() => {
        instance.updateArcType(input);
      });
    },
    updateArcPlace(input) {
      guardedMutate(() => {
        instance.updateArcPlace(input);
      });
    },
    addType(type) {
      guardedMutate(() => {
        instance.addType(type);
      });
    },
    updateType(input) {
      guardedMutate(() => {
        instance.updateType(input);
      });
    },
    removeType(input) {
      guardedMutate(() => {
        instance.removeType(input);
      });
    },
    addTypeElement(input) {
      guardedMutate(() => {
        instance.addTypeElement(input);
      });
    },
    updateTypeElement(input) {
      guardedMutate(() => {
        instance.updateTypeElement(input);
      });
    },
    removeTypeElement(input) {
      guardedMutate(() => {
        instance.removeTypeElement(input);
      });
    },
    moveTypeElement(input) {
      guardedMutate(() => {
        instance.moveTypeElement(input);
      });
    },
    addDifferentialEquation(equation) {
      guardedMutate(() => {
        instance.addDifferentialEquation(equation);
      });
    },
    updateDifferentialEquation(input) {
      guardedMutate(() => {
        instance.updateDifferentialEquation(input);
      });
    },
    removeDifferentialEquation(input) {
      guardedMutate(() => {
        instance.removeDifferentialEquation(input);
      });
    },
    addParameter(parameter) {
      guardedMutate(() => {
        instance.addParameter(parameter);
      });
    },
    updateParameter(input) {
      guardedMutate(() => {
        instance.updateParameter(input);
      });
    },
    removeParameter(input) {
      guardedMutate(() => {
        instance.removeParameter(input);
      });
    },
    addScenario(scenario) {
      scenarioMutate(() => {
        instance.addScenario(scenario);
      });
    },
    updateScenario(input) {
      scenarioMutate(() => {
        instance.updateScenario(input);
      });
    },
    removeScenario(input) {
      scenarioMutate(() => {
        instance.removeScenario(input);
      });
    },
    addMetric(metric) {
      scenarioMutate(() => {
        instance.addMetric(metric);
      });
    },
    updateMetric(input) {
      scenarioMutate(() => {
        instance.updateMetric(input);
      });
    },
    removeMetric(input) {
      scenarioMutate(() => {
        instance.removeMetric(input);
      });
    },
    deleteItemsByIds(input) {
      guardedMutate(() => {
        instance.deleteItemsByIds(input);
      });
    },
    commitNodePositions(input) {
      guardedMutate(() => {
        instance.commitNodePositions(input);
      });
    },
  };

  return <MutationContext.Provider value={value}>{children}</MutationContext.Provider>;
};
