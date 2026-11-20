import { useMemo } from "react";

import { useEditorState } from "./editor-context";

import type { PanelTarget } from "@hashintel/petrinaut-core";

export function usePanelTarget(): PanelTarget {
  const selection = useEditorState((editor) => editor.selection);

  return useMemo(() => {
    const items = Array.from(selection.values());
    if (items.length === 0) {
      return { kind: "none" };
    }
    if (items.length === 1) {
      return { kind: "single", item: items[0]! };
    }
    return { kind: "multi", items };
  }, [selection]);
}
