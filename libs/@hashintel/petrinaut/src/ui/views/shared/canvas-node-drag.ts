/**
 * The drag payload the toolbar and the Components panel hand to the canvas
 * when a node is dragged in: a place, a transition, or an instance of a
 * subnet.
 */

const canvasNodeDragMimeType = "application/petrinaut-canvas-node";

const componentPrefix = "component:";
const libraryPrefix = "library:";

export type DraggedNodeKind =
  | "place"
  | "transition"
  | `${typeof componentPrefix}${string}`
  | `${typeof libraryPrefix}${string}`;

/** The kind that drops an instance of `subnetId`. */
export const draggedComponentKind = (subnetId: string): DraggedNodeKind =>
  `${componentPrefix}${subnetId}`;

/** The subnet a component kind names, or `null` for any other kind. */
export const draggedComponentSubnetId = (
  kind: DraggedNodeKind,
): string | null =>
  kind.startsWith(componentPrefix) ? kind.slice(componentPrefix.length) : null;

/** The kind that drops an instance of a library component, copying it in first. */
export const draggedLibraryComponentKind = (
  libraryId: string,
  componentId: string,
): DraggedNodeKind =>
  `${libraryPrefix}${JSON.stringify([libraryId, componentId])}`;

/** The library and component a library kind names, or `null` for any other kind. */
export const draggedLibraryComponent = (
  kind: DraggedNodeKind,
): { libraryId: string; componentId: string } | null => {
  if (!kind.startsWith(libraryPrefix)) {
    return null;
  }
  const parsed: unknown = JSON.parse(kind.slice(libraryPrefix.length));
  return Array.isArray(parsed) &&
    typeof parsed[0] === "string" &&
    typeof parsed[1] === "string"
    ? { libraryId: parsed[0], componentId: parsed[1] }
    : null;
};

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
    (kind.startsWith(componentPrefix) &&
      kind.length > componentPrefix.length) ||
    (kind.startsWith(libraryPrefix) && kind.length > libraryPrefix.length)
    ? (kind as DraggedNodeKind)
    : null;
};
