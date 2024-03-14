import type { DrawHeaderCallback, Rectangle } from "@glideapps/glide-data-grid";

export type InteractablePosition = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

// used as `${tableId}-${columnIndex}-${rowIndex}`
export type CellPath = `${string}-${number}-${number}`;

// used as `${tableId}-${columnIndex}`
export type ColumnHeaderPath = `${string}-${number}`;

export type ColumnHeaderDrawArgs = Parameters<DrawHeaderCallback>[0] & {
  /**
   * The `tableId` is not included in the draw header callback args,
   * but we need this to derive the `path` of the interactable.
   */
  tableId: string;
};

type InteractableEventHandler = (interactable: Interactable) => void;

export interface Interactable {
  pos: InteractablePosition;
  path: CellPath | ColumnHeaderPath;
  hovered: boolean;
  cellRect: Rectangle;
  id: string;
  onClick?: InteractableEventHandler;
  onMouseEnter?: InteractableEventHandler;
  onMouseLeave?: InteractableEventHandler;
}

export interface CursorPos {
  posX: number;
  posY: number;
}
