import { useEffect, useState, type ReactNode } from "react";

import {
  ARC_ID_PREFIX,
  isSelectionTypeAvailableForExtensions,
} from "@hashintel/petrinaut-core";

import { createVisualizerDefinitionStore } from "./sdcpn-provider/visualizer-definition-store";
import { SDCPNContext, type SDCPNContextValue } from "./state/sdcpn-context";
import { usePetrinautInstance } from "./use-petrinaut-instance";
import { useStore } from "./use-store";

/**
 * Bridge: reads document state from the Core instance and republishes it
 * through {@link SDCPNContext}.
 */
export const SDCPNProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const instance = usePetrinautInstance();

  const [definition, setDefinition] = useState(() => ({
    source: instance.definition,
    store: createVisualizerDefinitionStore(
      instance.definition,
      instance.handle,
    ),
  }));
  if (definition.source !== instance.definition) {
    setDefinition({
      source: instance.definition,
      store: createVisualizerDefinitionStore(
        instance.definition,
        instance.handle,
      ),
    });
  }
  useEffect(() => {
    const flush = definition.store.flush;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.key === "Tab" ||
        event.key === "Escape"
      )
        flush();
    };
    window.addEventListener("pointerdown", flush, true);
    window.addEventListener("blur", flush, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", flush, true);
      window.removeEventListener("blur", flush, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [definition.store]);
  const petriNetDefinition = useStore(definition.store);
  const allNets = [
    petriNetDefinition,
    ...(petriNetDefinition.components ?? []),
  ];

  const value: SDCPNContextValue = {
    petriNetId: instance.handle.id,
    petriNetDefinition,
    readonly: instance.readonly,
    extensions: instance.extensions,
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

      if (
        isSelectionTypeAvailableForExtensions("fusion", instance.extensions) &&
        allNets.some((net) =>
          (net.fusions ?? []).some((fusion) => fusion.id === id),
        )
      ) {
        return "fusion";
      }

      return null;
    },
  };

  return (
    <SDCPNContext.Provider value={value}>{children}</SDCPNContext.Provider>
  );
};
