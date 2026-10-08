import { use } from "react";

import {
  EditorContext,
  type SimulateDrawerState,
  type SimulateViewMode,
} from "../state/editor-context";

import type { SelectionItem } from "@hashintel/petrinaut-core";

export type PetrinautRevealTarget =
  | { readonly kind: "selection"; readonly item: SelectionItem }
  | {
      readonly kind: "simulateView";
      readonly mode: SimulateViewMode;
      readonly itemId?: string;
    };

const simulateDrawerFor = (
  mode: SimulateViewMode,
  itemId: string | undefined,
): SimulateDrawerState => {
  if (!itemId) {
    return { type: "closed" };
  }
  switch (mode) {
    case "scenarios":
      return { type: "view-scenario", scenarioId: itemId };
    case "metrics":
      return { type: "view-metric", metricId: itemId };
    case "experiments":
      return { type: "view-experiment", experimentId: itemId };
  }
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
      simulateDrawer: simulateDrawerFor(target.mode, target.itemId),
    });
  };
};
