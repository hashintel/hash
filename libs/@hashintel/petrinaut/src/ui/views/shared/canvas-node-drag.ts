/**
 * The drag payloads handed to the canvas: the kind of node dragged in from a
 * toolbar button, or the subnet of the component dragged in from the
 * Components panel.
 */

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

/** `subnetId` is the subnet the dropped instance will point at. */
export const writeDraggedComponent = (
  dataTransfer: DataTransfer,
  subnetId: string,
): void => {
  dataTransfer.setData(canvasComponentDragMimeType, subnetId);
};

export const readDraggedComponent = (
  dataTransfer: DataTransfer,
): string | null => dataTransfer.getData(canvasComponentDragMimeType) || null;
