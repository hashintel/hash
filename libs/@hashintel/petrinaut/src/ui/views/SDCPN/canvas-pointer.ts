/**
 * What the pointer is doing on the canvas. It is state of the canvas view and
 * not of the editor, so a pointer move renders the canvas and nothing else.
 */

import { createContext, use, useSyncExternalStore } from "react";

import {
  createValueStore,
  type ValueStore,
} from "../../../react/create-value-store";

import type { CanvasDragPreview } from "./canvas-scene";

export type CanvasPointer = {
  /** The node or line under the pointer, before the hover has settled. */
  hoveredId: ValueStore<string | null>;
  /** Where each node of a drag under way is shown, until the drop commits it. */
  dragPreview: ValueStore<CanvasDragPreview>;
};

export const createCanvasPointer = (): CanvasPointer => ({
  hoveredId: createValueStore<string | null>(null),
  dragPreview: createValueStore<CanvasDragPreview>(new Map()),
});

/** The pointer of the canvas view around; outside one, a pointer nobody reads. */
export const CanvasPointerContext = createContext(createCanvasPointer());

export const useValueOf = <Value>(store: ValueStore<Value>): Value =>
  useSyncExternalStore(store.subscribe, store.getSnapshot);

/** Whether the pointer is on this node or line. Renders when the answer changes. */
export const useIsHovered = (id: string): boolean => {
  const { hoveredId } = use(CanvasPointerContext);
  return useSyncExternalStore(
    hoveredId.subscribe,
    () => hoveredId.getSnapshot() === id,
  );
};
