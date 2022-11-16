import { Rectangle } from "@glideapps/glide-data-grid";

export type InteractablePosition = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

// used as `${tableId}-${col}-${row}`
export type CellPath = `${string}-${number}-${number}`;

type InteractableEventHandler = (interactable: Interactable) => void;

export interface Interactable {
  pos: InteractablePosition;
  path: CellPath;
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
