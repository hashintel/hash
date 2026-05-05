import { use, useMemo } from "react";

import { EditorContext } from "./editor-context";
import type { PanelTarget } from "./selection";

export function usePanelTarget(): PanelTarget {
  const { selection } = use(EditorContext);

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
