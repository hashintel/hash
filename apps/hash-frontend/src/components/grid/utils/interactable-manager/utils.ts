import type {
  CustomCell,
  DrawArgs,
  Rectangle,
} from "@glideapps/glide-data-grid";

import type {
  CellPath,
  ColumnHeaderDrawArgs,
  ColumnHeaderPath,
  CursorPos,
  InteractablePosition,
} from "./types";

export const isPathCellPath = (
  path: CellPath | ColumnHeaderPath,
): path is CellPath => path.split("-").length === 3;

export const drawArgsToCellPath = (args: DrawArgs<CustomCell>): CellPath => {
  const { tableId, col, row } = args;
  return `${tableId}-${col}-${row}`;
};

export const drawArgsToColumnHeaderPath = (
  args: ColumnHeaderDrawArgs,
): ColumnHeaderPath => {
  const { tableId, columnIndex } = args;
  return `${tableId}-${columnIndex}`;
};

export const splitPath = (path: CellPath) => {
  const [tableId, colIndex, rowIndex] = path.split("-");

  if (!tableId || !colIndex || !rowIndex) {
    throw new Error(
      `CellPath should have '{tableId}-{colIndex}-{rowIndex}' format`,
    );
  }

  return {
    tableId,
    colIndex: Number(colIndex),
    rowIndex: Number(rowIndex),
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
