import { CustomCell, Rectangle } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { CellPath, CursorPos, InteractablePosition } from "./types";

export const drawArgsToPath = (args: DrawArgs<CustomCell>): CellPath => {
  const { tableId, col, row } = args;
  return `${tableId}-${col}-${row}`;
};

export const splitPath = (path: CellPath) => {
  const [tableId, col, row] = path.split("-");

  if (!tableId || !col || !row) {
    throw new Error(`CellPath should have '{tableId}-{col}-{row}' format`);
  }

  return {
    tableId,
    col: Number(col),
    row: Number(row),
  };
};

export const isCursorOnInteractable = (
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
