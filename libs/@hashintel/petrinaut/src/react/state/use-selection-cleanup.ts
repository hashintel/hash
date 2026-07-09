import { use, useEffect } from "react";

import {
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  type SelectionMap,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "./active-net-context";
import { EditorContext } from "./editor-context";
import { SDCPNContext } from "./sdcpn-context";

/**
 * Reactively removes stale IDs from the selection when items are deleted from the SDCPN.
 */
export function useSelectionCleanup() {
  const { activeNet } = use(ActiveNetContext);
  const { extensions } = use(SDCPNContext);
  const { selection, setSelection, hoveredItem, clearHoveredItem } =
    use(EditorContext);

  useEffect(() => {
    if (selection.size === 0 && !hoveredItem) {
      return;
    }

    // Build the set of all valid IDs
    const validIds = new Set<string>();

    for (const place of activeNet.places) {
      validIds.add(place.id);
    }
    for (const transition of activeNet.transitions) {
      validIds.add(transition.id);
      for (const inputArc of transition.inputArcs) {
        const endpoint = getArcEndpoint(inputArc);
        validIds.add(
          generateArcId({
            inputId: getArcEndpointKey(endpoint),
            outputId: transition.id,
          }),
        );
      }
      for (const outputArc of transition.outputArcs) {
        const endpoint = getArcEndpoint(outputArc);
        validIds.add(
          generateArcId({
            inputId: transition.id,
            outputId: getArcEndpointKey(endpoint),
          }),
        );
      }
    }
    if (extensions.colors) {
      for (const type of activeNet.types) {
        validIds.add(type.id);
      }
    }
    if (extensions.colors && extensions.dynamics) {
      for (const eq of activeNet.differentialEquations) {
        validIds.add(eq.id);
      }
    }
    if (extensions.parameters) {
      for (const param of activeNet.parameters) {
        validIds.add(param.id);
      }
    }
    for (const instance of activeNet.componentInstances) {
      validIds.add(instance.id);
    }

    // Check if any selected ID is stale
    let hasStale = false;
    for (const id of selection.keys()) {
      if (!validIds.has(id)) {
        hasStale = true;
        break;
      }
    }

    if (hasStale) {
      setSelection((prev) => {
        const cleaned: SelectionMap = new Map();
        for (const [id, item] of prev) {
          if (validIds.has(id)) {
            cleaned.set(id, item);
          }
        }
        return cleaned;
      });
    }

    // Clear hoveredItem if it references a deleted element
    if (hoveredItem && !validIds.has(hoveredItem.id)) {
      clearHoveredItem();
    }
  }, [
    activeNet,
    extensions,
    selection,
    setSelection,
    hoveredItem,
    clearHoveredItem,
  ]);
}
