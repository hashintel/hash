import { CustomCell, Rectangle } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";

type InteractablePosition = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

interface Interactable {
  pos: InteractablePosition;
  path: CellPath;
  hovered: boolean;
  cellRect: Rectangle;
  id: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

interface CursorPos {
  posX: number;
  posY: number;
}

interface CellPath {
  tableId: string;
  col: number;
  row: number;
}

const isCursorOnInteractable = (
  cursorPos: CursorPos,
  interactablePos: InteractablePosition,
  cellRect: Rectangle,
) => {
  const left = interactablePos.left - cellRect.x;
  const right = interactablePos.right - cellRect.x;
  const top = interactablePos.top - cellRect.y;
  const bottom = interactablePos.bottom - cellRect.y;

  const cursorX = cursorPos.posX;
  const cursorY = cursorPos.posY;

  const hovered =
    cursorX > left && cursorX < right && cursorY < bottom && cursorY > top;

  return hovered;
};

class InteractableManagerClass {
  static instance: InteractableManagerClass | null = null;

  // structure is like `{table}-{col}-{row}` -> id -> interactable
  private interactableStore: Record<string, Record<string, Interactable>> = {};

  create(
    args: DrawArgs<CustomCell>,
    interactable: Omit<Interactable, "hovered">,
  ): Interactable {
    const { hoverX = -100, hoverY = -100, rect } = args;

    const hovered = isCursorOnInteractable(
      { posX: hoverX, posY: hoverY },
      interactable.pos,
      rect,
    );

    return { ...interactable, hovered };
  }

  cellPathToString({ tableId, col, row }: CellPath) {
    return `${tableId}-${col}-${row}`;
  }

  setInteractablesForCell(path: CellPath, interactables: Interactable[]) {
    const strPath = this.cellPathToString(path);

    const interactableMap = Object.fromEntries(
      interactables.map((interactable) => [interactable.id, interactable]),
    );

    /**
     * for each interactable, check if the hover status changed
     * if it's changed, trigger corresponding event
     */
    for (const interactable of interactables) {
      const existing = this.interactableStore[strPath]?.[interactable.id];

      if (existing && existing.hovered !== interactable.hovered) {
        const event = interactable.hovered
          ? interactable.onMouseEnter
          : interactable.onMouseLeave;

        event?.();
      }
    }

    this.interactableStore[strPath] = interactableMap;
  }

  handleClick(path: CellPath, event: CursorPos) {
    const strPath = this.cellPathToString(path);

    const interactableMap = this.interactableStore[strPath] ?? {};
    const interactables = Object.values(interactableMap);

    let foundInteractable: Interactable | undefined;

    for (let i = 0; i < interactables.length; i++) {
      const interactable = interactables[i]!;
      const { pos, cellRect } = interactable;

      const hovered = isCursorOnInteractable(event, pos, cellRect);

      if (hovered) {
        foundInteractable = interactable;
      }
    }

    if (foundInteractable) {
      /**
       * @todo if there is only a hover effect, we need to trigger it here, because hovers will be working on click on mobile
       * also we should preventDefault here probably, if there is an event defined, we don't want the editor to popup
       */
      foundInteractable.onClick?.();
    }
  }
}

export const InteractableManager = new InteractableManagerClass();
Object.freeze(InteractableManager);
