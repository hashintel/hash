import { useState } from "react";

import { useEditorState } from "./editor-context";

import type { PanelTarget, SelectionMap } from "@hashintel/petrinaut-core";

const panelTargetOf = (selection: SelectionMap): PanelTarget => {
  const items = Array.from(selection.values());
  if (items.length === 0) {
    return { kind: "none" };
  }
  if (items.length === 1) {
    return { kind: "single", item: items[0]! };
  }
  return { kind: "multi", items };
};

export function usePanelTarget(): PanelTarget {
  const selection = useEditorState((editor) => editor.selection);
  return panelTargetOf(selection);
}

/**
 * What the selection shows in a panel, and while nothing is selected, what it
 * showed last. A panel that closes when the selection empties reads this, so
 * that it keeps its content for as long as it is still in view.
 */
export function useLastPanelTarget(): PanelTarget {
  const selection = useEditorState((editor) => editor.selection);
  const [lastSelection, setLastSelection] = useState(selection);
  if (selection.size > 0 && selection !== lastSelection) {
    setLastSelection(selection);
  }
  return panelTargetOf(selection.size > 0 ? selection : lastSelection);
}
