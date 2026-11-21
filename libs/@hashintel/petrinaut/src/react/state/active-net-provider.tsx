import { use, useEffect, type ReactNode } from "react";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import { useStableCallback } from "../hooks/use-stable-callback";
import { openPetrinautComponent, usePetrinautNavigation } from "../navigation";
import { ActiveNetContext } from "./active-net-context";
import { SDCPNContext } from "./sdcpn-context";
import { useComposesOnly } from "./use-composes-only";

/**
 * Derives the active net from the full SDCPN. When a component is active,
 * editor panels and canvas operations read that component's local
 * places/transitions/etc.
 *
 * activeComponentId is part of Petrinaut's app location. Changing components
 * clears selection in the same atomic transition. The navigation provider is
 * keyed by document, so uncontrolled locations reset when the active handle
 * changes. A requested component id resolves through `toPetrinautId`, and the
 * location is rewritten to the canonical id, or to the root net when no
 * component matches. Every id resolves to the root net in an editor that only
 * composes: it changes the root net alone, and has no panel that leads back
 * from a component.
 */
export const ActiveNetProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const composesOnly = useComposesOnly();
  const navigation = usePetrinautNavigation();
  const requestedComponentId = navigation.state.componentId;

  // One function for the provider's life. `navigation.navigate` is a new
  // function after every navigation, a selection included, and a function
  // made from it here would give every reader of the active net a new context
  // value each time something is selected.
  const setActiveComponentId = useStableCallback(
    (componentId: string | null) => {
      navigation.navigate(openPetrinautComponent(componentId), {
        cause: "user",
        action: "component",
      });
    },
  );

  const canonicalComponentId =
    requestedComponentId !== null ? toPetrinautId(requestedComponentId) : null;
  const component =
    !composesOnly && canonicalComponentId !== null
      ? petriNetDefinition.components?.find(
          ({ id }) => id === canonicalComponentId,
        )
      : undefined;

  const resolvedComponentId = component ? canonicalComponentId : null;

  useEffect(() => {
    if (
      requestedComponentId !== null &&
      requestedComponentId !== resolvedComponentId
    ) {
      navigation.navigate(openPetrinautComponent(resolvedComponentId), {
        cause: "normalization",
        action: "component",
      });
    }
  }, [navigation, requestedComponentId, resolvedComponentId]);

  const activeNet = component
    ? {
        places: component.places,
        transitions: component.transitions,
        types: component.types,
        differentialEquations: component.differentialEquations,
        parameters: component.parameters,
        componentInstances: component.componentInstances ?? [],
        fusions: component.fusions ?? [],
      }
    : {
        places: petriNetDefinition.places,
        transitions: petriNetDefinition.transitions,
        types: petriNetDefinition.types,
        differentialEquations: petriNetDefinition.differentialEquations,
        parameters: petriNetDefinition.parameters,
        componentInstances: petriNetDefinition.componentInstances ?? [],
        fusions: petriNetDefinition.fusions ?? [],
      };

  return (
    <ActiveNetContext
      value={{
        activeNet,
        activeComponentId: resolvedComponentId,
        setActiveComponentId,
      }}
    >
      {children}
    </ActiveNetContext>
  );
};
