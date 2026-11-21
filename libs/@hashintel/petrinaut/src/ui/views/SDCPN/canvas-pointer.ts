/**
 * What the pointer is doing on the canvas. It is state of the canvas view and
 * not of the editor, so a pointer move renders the canvas and nothing else.
 */

import { createContext, use } from "react";

import {
  createReadableStore,
  type ReadableStore,
} from "@hashintel/petrinaut-core";

import { useStoreSelector } from "../../../react/use-store";

import type { CanvasDragPreview } from "./canvas-scene";

type WritableStore<Value> = ReadableStore<Value> & { set(next: Value): void };

export type CanvasPointer = {
  /** The node or line under the pointer, before the hover has settled. */
  hoveredId: WritableStore<string | null>;
  /**
   * The node or line that came under the pointer while a button was down. It
   * is hovered when the button is released, if the pointer is still on it.
   */
  hoverOnReleaseId: WritableStore<string | null>;
  /** Where each node of a drag under way is shown, until the drop commits it. */
  dragPreview: WritableStore<CanvasDragPreview>;
};

export const createCanvasPointer = (): CanvasPointer => ({
  hoveredId: createReadableStore<string | null>(null),
  hoverOnReleaseId: createReadableStore<string | null>(null),
  dragPreview: createReadableStore<CanvasDragPreview>(new Map()),
});

/** The pointer of the canvas view around; outside one, a pointer nobody reads. */
export const CanvasPointerContext = createContext(createCanvasPointer());

/** Whether the pointer is on this node or line. Renders when the answer changes. */
export const useIsHovered = (id: string): boolean => {
  const { hoveredId } = use(CanvasPointerContext);
  return useStoreSelector(hoveredId, (hovered) => hovered === id);
};
