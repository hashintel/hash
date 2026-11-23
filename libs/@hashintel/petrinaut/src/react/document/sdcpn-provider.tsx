import { useEffect, useState, type ReactNode } from "react";

import { usePublished } from "../shared/select-from-context";
import { useStore } from "../shared/use-store";
import {
  SDCPNContext,
  SDCPNPublishedContext,
  type SDCPNContextValue,
} from "./sdcpn-context";
import { createItemTypeLookup } from "./sdcpn-provider/item-type-lookup";
import { createVisualizerDefinitionStore } from "./sdcpn-provider/visualizer-definition-store";
import { usePetrinautInstance } from "./use-petrinaut-instance";

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

  const value: SDCPNContextValue = {
    petriNetId: instance.handle.id,
    petriNetDefinition,
    readonly: instance.readonly,
    extensions: instance.extensions,
    getItemType: createItemTypeLookup(petriNetDefinition, instance.extensions),
  };

  const published = usePublished(value);

  return (
    <SDCPNPublishedContext value={published}>
      <SDCPNContext value={value}>{children}</SDCPNContext>
    </SDCPNPublishedContext>
  );
};
