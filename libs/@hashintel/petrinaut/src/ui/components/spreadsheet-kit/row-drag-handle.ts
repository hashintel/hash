import { createContext, use } from "react";

import type { useSortable } from "@dnd-kit/sortable";

export interface RowDragHandle {
  /** Attach to the element a pointer drag starts from. */
  ref: (element: HTMLElement | null) => void;
  /** Spread onto that element; `undefined` while reordering is disabled. */
  listeners: ReturnType<typeof useSortable>["listeners"];
  dragging: boolean;
}

export const RowDragContext = createContext<RowDragHandle | null>(null);

/** The enclosing `ReorderableRow`'s drag handle, `null` outside one. */
export const useRowDragHandle = (): RowDragHandle | null => use(RowDragContext);
