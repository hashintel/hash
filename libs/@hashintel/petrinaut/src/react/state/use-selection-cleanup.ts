import { use, useEffect } from "react";

import {
  generateArcId,
  getArcEndpoint,
  getArcEndpointKey,
  type SelectionMap,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../document/active-net-context";
import { SDCPNContext } from "../document/sdcpn-context";
import { useEditorActions, useEditorState } from "./editor-context";

/**
 * Reactively removes stale IDs from the selection when items are deleted from the SDCPN.
 */
export function useSelectionCleanup() {
  const { activeNet } = use(ActiveNetContext);
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const selection = useEditorState((editor) => editor.selection);
  const { setSelection } = useEditorActions();

  useEffect(() => {
    if (selection.size === 0) {
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
    for (const fusion of activeNet.fusions) {
      validIds.add(fusion.id);
    }
    // Metrics belong to the document, so they stay valid in every net.
    for (const metric of petriNetDefinition.metrics ?? []) {
      validIds.add(metric.id);
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
      setSelection(
        (prev) => {
          const cleaned: SelectionMap = new Map();
          for (const [id, item] of prev) {
            if (validIds.has(id)) {
              cleaned.set(id, item);
            }
          }
          return cleaned;
        },
        { cause: "normalization" },
      );
    }
  }, [
    activeNet,
    extensions,
    petriNetDefinition.metrics,
    selection,
    setSelection,
  ]);
}
