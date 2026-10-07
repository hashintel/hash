import { use } from "react";

import { EditorContext, type SimulateViewMode } from "../state/editor-context";

import type { SelectionItem } from "@hashintel/petrinaut-core";

export type PetrinautRevealTarget =
  | { readonly kind: "selection"; readonly item: SelectionItem }
  | {
      readonly kind: "simulateView";
      readonly mode: SimulateViewMode;
      readonly itemId?: string;
    };

/**
 * Shows a target the way the editor's own controls do: an item becomes the
 * selection and opens in the properties panel, a scenario, metric or
 * experiment opens in Simulate's drawer, and no id opens the list alone.
 */
export const useRevealInEditor = (): ((
  target: PetrinautRevealTarget,
) => void) => {
  const { navigateTo, selectItem } = use(EditorContext);

  return (target) => {
    if (target.kind === "selection") {
      selectItem(target.item);

      return;
    }

    navigateTo({
      globalMode: "simulate",
      simulateViewMode: target.mode,
      simulateDrawer:
        target.itemId === undefined
          ? { type: "closed" }
          : target.mode === "scenarios"
            ? { type: "view-scenario", scenarioId: target.itemId }
            : target.mode === "metrics"
              ? { type: "view-metric", metricId: target.itemId }
              : { type: "view-experiment", experimentId: target.itemId },
    });
  };
};
