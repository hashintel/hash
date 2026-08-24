import { useRef } from "react";

/**
 * Spreadsheet-style focus movement for a small grid of focusable cells.
 * Cells register under their (row, column) position; arrow keys move focus
 * to the nearest registered neighbour in that direction, skipping positions
 * nothing registered (a column a row does not have). Inside a text input the
 * horizontal arrows keep moving the caret — only the vertical ones navigate.
 */
export function useGridNavigation(): {
  register: (
    row: number,
    column: number,
  ) => (element: HTMLElement | null) => void;
  onKeyDown: (row: number, column: number) => React.KeyboardEventHandler;
} {
  const cells = useRef(new Map<string, HTMLElement>());
  const bounds = useRef({ rows: 0, columns: 0 });

  const register =
    (row: number, column: number) => (element: HTMLElement | null) => {
      const key = `${row}-${column}`;
      if (element) {
        cells.current.set(key, element);
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
      const element = cells.current.get(`${r}-${c}`);
      if (element) {
        element.focus();
        return true;
      }
      r += rowStep;
      c += columnStep;
    }
    return false;
  };

  const onKeyDown =
    (row: number, column: number): React.KeyboardEventHandler =>
    (event) => {
      const target = event.target as HTMLElement;
      const inTextField =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      let handled = false;
      if (event.key === "ArrowDown") {
        handled = move(row, column, 1, 0);
      } else if (event.key === "ArrowUp") {
        handled = move(row, column, -1, 0);
      } else if (event.key === "ArrowRight" && !inTextField) {
        handled = move(row, column, 0, 1);
      } else if (event.key === "ArrowLeft" && !inTextField) {
        handled = move(row, column, 0, -1);
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

  return { register, onKeyDown };
}
