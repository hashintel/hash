/**
 * The drag payload the toolbar hands to the canvas when a node is dragged in
 * from a toolbar button.
 */

const canvasNodeDragMimeType = "application/petrinaut-canvas-node";

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
