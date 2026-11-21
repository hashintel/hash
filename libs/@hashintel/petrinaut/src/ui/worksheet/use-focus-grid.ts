/**
 * Spreadsheet-style focus movement for a uniform grid of focusable cells,
 * as one member of the enclosing `FocusStack`. Cells register under their
 * (row, column) position; arrow keys move focus to the nearest registered
 * neighbour, skipping positions nothing registered. Inside a text input the
 * horizontal arrows keep moving the caret — only the vertical ones
 * navigate.
 *
 * A move past any edge asks the stack to carry focus onward, with the
 * source position attached so an `entry="aligned"` neighbour can keep the
 * row of a horizontal move or the column of a vertical one. A refused move
 * leaves focus where it is.
 *
 * The grid is one tab stop: `tabIndexFor` roves the tabbable cell — the
 * last-focused one, falling back to (0, 0) — and entering the grid restores
 * that remembered cell (or the aligned/edge position of the arriving move).
 * The memory drops when the remembered cell unregisters. A grid whose cells
 * keep their own tab stops passes `tabStop: "native"`.
 */

import { useEffect, useRef } from "react";

import { arrowDirection, focusLands, type FocusEntry } from "./focus-flow";
import { useFocusMember } from "./use-focus-member";
import { useFocusMemory, type FocusTabStop } from "./use-focus-memory";

export interface FocusGrid {
  register: (
    row: number,
    column: number,
  ) => (element: HTMLElement | null) => void;
  /** Focuses the cell at a position; false when none took focus. */
  focus: (row: number, column: number) => boolean;
  onKeyDown: (row: number, column: number) => React.KeyboardEventHandler;
  /** Reports the cell that gained focus; wire to every cell's onFocus. */
  onFocusCell: (row: number, column: number) => void;
  /** 0 for the grid's one tabbable cell, -1 for the rest. */
  tabIndexFor: (row: number, column: number) => 0 | -1;
  /** Attach to the grid's root element; registered while mounted. */
  attach: (element: HTMLElement | null) => void;
}

interface Cell {
  row: number;
  column: number;
}

const cellKey = (row: number, column: number) => `${row}-${column}`;

const sameCell = (a: Cell, b: Cell) => a.row === b.row && a.column === b.column;

/** The remembered cell until one takes focus. */
const firstCell: Cell = { row: 0, column: 0 };

interface FocusGridOptions {
  /** Defaults to "roving". */
  tabStop?: FocusTabStop;
}

export function useFocusGrid({
  tabStop = "roving",
}: FocusGridOptions = {}): FocusGrid {
  const cells = useRef(new Map<string, HTMLElement>());
  const bounds = useRef({ rows: 0, columns: 0 });
  const { remember, recall, tabbable } = useFocusMemory(tabStop, sameCell);

  const register =
    (row: number, column: number) => (target: HTMLElement | null) => {
      const key = cellKey(row, column);
      if (target) {
        cells.current.set(key, target);
        bounds.current.rows = Math.max(bounds.current.rows, row + 1);
        bounds.current.columns = Math.max(bounds.current.columns, column + 1);
      } else {
        cells.current.delete(key);
      }
    };

  const move = (
    row: number,
    column: number,
    rowStep: number,
    columnStep: number,
  ): boolean => {
    let r = row + rowStep;
    let c = column + columnStep;
    while (
      r >= 0 &&
      c >= 0 &&
      r < bounds.current.rows &&
      c < bounds.current.columns
    ) {
      const target = cells.current.get(cellKey(r, c));
      if (target) {
        target.focus();
        return true;
      }
      r += rowStep;
      c += columnStep;
    }
    return false;
  };

  /** The nearest registered cell to a wished position, scanning that row
   * first and then neighbouring rows. */
  const focusNearest = (row: number, column: number): boolean => {
    const rows = bounds.current.rows;
    const columns = bounds.current.columns;
    const wishedRow = Math.min(Math.max(row, 0), Math.max(rows - 1, 0));
    const wishedColumn = Math.min(
      Math.max(column, 0),
      Math.max(columns - 1, 0),
    );
    for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
      for (const r of rowOffset === 0
        ? [wishedRow]
        : [wishedRow - rowOffset, wishedRow + rowOffset]) {
        if (r < 0 || r >= rows) {
          continue;
        }
        for (let columnOffset = 0; columnOffset < columns; columnOffset += 1) {
          for (const c of columnOffset === 0
            ? [wishedColumn]
            : [wishedColumn - columnOffset, wishedColumn + columnOffset]) {
            if (c < 0 || c >= columns) {
              continue;
            }
            if (focusLands(cells.current.get(cellKey(r, c)))) {
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  const enter = (entry: FocusEntry): boolean => {
    // Aligned entry: keep the source row on a horizontal move, the source
    // column on a vertical one; the travel direction supplies the other
    // coordinate (arriving downward means the top row).
    if (entry.from) {
      const horizontal =
        entry.direction === "left" || entry.direction === "right";
      const row = horizontal
        ? entry.from.row
        : entry.direction === "down"
          ? 0
          : bounds.current.rows - 1;
      const column = horizontal
        ? entry.direction === "right"
          ? 0
          : bounds.current.columns - 1
        : entry.from.column;
      return focusNearest(row, column);
    }
    // Remembered entry: the last-focused cell, wherever it is.
    const last = recall() ?? firstCell;
    if (focusLands(cells.current.get(cellKey(last.row, last.column)))) {
      return true;
    }
    const fromEnd = entry.direction === "up" || entry.direction === "left";
    return focusNearest(
      fromEnd ? bounds.current.rows - 1 : 0,
      fromEnd ? bounds.current.columns - 1 : 0,
    );
  };

  const { attach, element, moveFrom } = useFocusMember(enter);

  // Memory needs no consumer wiring: any focus landing inside the grid —
  // arrows, Tab, pointer clicks — is remembered via focusin on the grid's
  // root. `onFocusCell` stays for cells rendered outside it.
  useEffect(() => {
    if (!element) {
      return undefined;
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }
      for (const [key, cell] of cells.current) {
        if (cell === event.target || cell.contains(event.target)) {
          const [row, column] = key.split("-").map(Number);
          remember({ row: row!, column: column! });
          return;
        }
      }
    };
    element.addEventListener("focusin", onFocusIn);
    return () => element.removeEventListener("focusin", onFocusIn);
  }, [element, remember]);

  const onKeyDown =
    (row: number, column: number): React.KeyboardEventHandler =>
    (event) => {
      const direction = arrowDirection(event);
      if (direction === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const moved =
        direction === "down"
          ? move(row, column, 1, 0)
          : direction === "up"
            ? move(row, column, -1, 0)
            : direction === "right"
              ? move(row, column, 0, 1)
              : move(row, column, 0, -1);
      if (!moved) {
        moveFrom(direction, { row, column });
      }
    };

  return {
    register,
    focus: (row, column) => focusLands(cells.current.get(cellKey(row, column))),
    onKeyDown,
    onFocusCell: (row, column) => remember({ row, column }),
    tabIndexFor: (row, column) =>
      sameCell(tabbable ?? firstCell, { row, column }) ? 0 : -1,
    attach,
  };
}
