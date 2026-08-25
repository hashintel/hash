import { use, useEffect, useId, useRef, useState } from "react";

import {
  focusLands,
  FormNavigationContext,
  type NavigationDirection,
} from "./use-form-navigation";

/**
 * Spreadsheet-style focus movement for a small grid of focusable cells.
 * Cells register under their (row, column) position; arrow keys move focus
 * to the nearest registered neighbour in that direction, skipping positions
 * nothing registered (a column a row does not have). Inside a text input the
 * horizontal arrows keep moving the caret — only the vertical ones navigate.
 *
 * A vertical move past the first or last row calls `onExit`, so the grid can
 * hand focus to the neighbouring form zone; `focusEdge` is the reverse door,
 * focusing the grid's first or last row when a neighbour hands focus in.
 */
export function useGridNavigation(options?: {
  onExit?: (direction: NavigationDirection) => void;
}): {
  register: (
    row: number,
    column: number,
  ) => (element: HTMLElement | null) => void;
  onKeyDown: (row: number, column: number) => React.KeyboardEventHandler;
  focusEdge: (edge: "first" | "last") => boolean;
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

  const focusEdge = (edge: "first" | "last"): boolean => {
    for (let offset = 0; offset < bounds.current.rows; offset += 1) {
      const row = edge === "first" ? offset : bounds.current.rows - 1 - offset;
      for (let column = 0; column < bounds.current.columns; column += 1) {
        if (focusLands(cells.current.get(`${row}-${column}`))) {
          return true;
        }
      }
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
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        handled = move(row, column, step, 0);
        if (!handled && options?.onExit) {
          options.onExit(step === 1 ? "next" : "previous");
          handled = true;
        }
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

  return { register, onKeyDown, focusEdge };
}

/**
 * A grid that participates in the form's zone walk: arrow moves past its
 * edges continue into the neighbouring zone, and neighbours enter it at the
 * matching edge.
 */
export function useNavigationGrid(): {
  register: (
    row: number,
    column: number,
  ) => (element: HTMLElement | null) => void;
  onKeyDown: (row: number, column: number) => React.KeyboardEventHandler;
  attach: (element: HTMLElement | null) => void;
} {
  const navigation = use(FormNavigationContext);
  const id = useId();
  const grid = useGridNavigation({
    onExit: (direction) => navigation.exit(id, direction),
  });
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!element) {
      return undefined;
    }
    navigation.register(id, { element, enter: grid.focusEdge });
    return () => navigation.unregister(id);
  }, [navigation, id, element, grid.focusEdge]);
  return {
    register: grid.register,
    onKeyDown: grid.onKeyDown,
    attach: setElement,
  };
}
