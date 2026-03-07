import { use, useEffect } from "react";

import { EditorContext } from "./editor-context";
import { generateArcId, SDCPNContext } from "./sdcpn-context";
import type { SelectionMap } from "./selection";

/**
 * Reactively removes stale IDs from the selection when items are deleted from the SDCPN.
 */
export function useSelectionCleanup() {
  const { petriNetDefinition } = use(SDCPNContext);
  const { selection, setSelection } = use(EditorContext);

  useEffect(() => {
    if (selection.size === 0) {
      return;
    }

    // Build the set of all valid IDs
    const validIds = new Set<string>();

    for (const place of petriNetDefinition.places) {
      validIds.add(place.id);
    }
    for (const transition of petriNetDefinition.transitions) {
      validIds.add(transition.id);
      for (const inputArc of transition.inputArcs) {
        validIds.add(
          generateArcId({ inputId: inputArc.placeId, outputId: transition.id }),
        );
      }
      for (const outputArc of transition.outputArcs) {
        validIds.add(
          generateArcId({
            inputId: transition.id,
            outputId: outputArc.placeId,
          }),
        );
      }
    }
    for (const type of petriNetDefinition.types) {
      validIds.add(type.id);
    }
    for (const eq of petriNetDefinition.differentialEquations) {
      validIds.add(eq.id);
    }
    for (const param of petriNetDefinition.parameters) {
      validIds.add(param.id);
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
      const cleaned: SelectionMap = new Map();
      for (const [id, item] of selection) {
        if (validIds.has(id)) {
          cleaned.set(id, item);
        }
      }
      setSelection(cleaned);
    }
  }, [petriNetDefinition, selection, setSelection]);
}
