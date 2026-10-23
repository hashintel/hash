/**
 * The drag payload the toolbar and the Components panel hand to the canvas
 * when a node is dragged in: a place, a transition, or an instance of a
 * subnet.
 */

const canvasNodeDragMimeType = "application/petrinaut-canvas-node";

const componentPrefix = "component:";

export type DraggedNodeKind =
  | "place"
  | "transition"
  | `${typeof componentPrefix}${string}`;

/** The kind that drops an instance of `subnetId`. */
export const draggedComponentKind = (subnetId: string): DraggedNodeKind =>
  `${componentPrefix}${subnetId}`;

/** The subnet a component kind names, or `null` for a place or a transition. */
export const draggedComponentSubnetId = (
  kind: DraggedNodeKind,
): string | null =>
  kind.startsWith(componentPrefix) ? kind.slice(componentPrefix.length) : null;

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
  return kind === "place" ||
    kind === "transition" ||
    (kind.startsWith(componentPrefix) && kind.length > componentPrefix.length)
    ? (kind as DraggedNodeKind)
    : null;
};
