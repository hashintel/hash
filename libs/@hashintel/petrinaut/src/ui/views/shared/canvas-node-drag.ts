/**
 * The drag payloads handed to the canvas: the kind of node dragged in from a
 * toolbar button, or the component dragged in from the Components panel.
 */

import type { ComponentReference } from "@hashintel/petrinaut-core";

const canvasNodeDragMimeType = "application/petrinaut-canvas-node";
const canvasComponentDragMimeType = "application/petrinaut-canvas-component";

export type DraggedNodeKind = "place" | "transition";

export const writeDraggedNodeKind = (
  dataTransfer: DataTransfer,
  kind: DraggedNodeKind,
): void => {
  dataTransfer.setData(canvasNodeDragMimeType, kind);
};

export const readDraggedNodeKind = (
  dataTransfer: DataTransfer,
): DraggedNodeKind | null => {
  const kind = dataTransfer.getData(canvasNodeDragMimeType);
  return kind === "place" || kind === "transition" ? kind : null;
};

/** `component` is what the dropped instance will be an instance of. */
export const writeDraggedComponent = (
  dataTransfer: DataTransfer,
  component: ComponentReference,
): void => {
  dataTransfer.setData(canvasComponentDragMimeType, JSON.stringify(component));
};

export const readDraggedComponent = (
  dataTransfer: DataTransfer,
): ComponentReference | null => {
  const payload = dataTransfer.getData(canvasComponentDragMimeType);
  if (payload === "") {
    return null;
  }
  const { from, id } = JSON.parse(payload) as { from?: unknown; id?: unknown };
  if (typeof id !== "string") {
    return null;
  }
  return typeof from === "string" ? { from, id } : { id };
};
