/**
 * Focus movement for tables whose lines are not a uniform grid, as one
 * member of the enclosing `FocusStack`. The owner declares an ordered list
 * of stops, top to bottom:
 *
 * - `row` — a full line of cells, columns 0..columnCount-1, optionally
 *   with a gutter lane on its left;
 * - `full` — one full-width target (a dynamic row's count strip);
 * - `sparse` — a line with targets in some columns only (a shared-values
 *   line), entered at the nearest declared column.
 *
 * Vertical arrows walk the stops, carrying the column across full-width
 * stops (column memory); horizontal arrows walk a line's own parts. The
 * gutter is its own lane: vertical moves stay gutter-to-gutter over `row`
 * stops, ArrowRight enters the line's cells at column 0, and ArrowLeft
 * from column 0 returns to it. Moves past any edge ask the stack to carry
 * focus onward; a refused move leaves focus where it is.
 *
 * Focusing stays the owner's: `focusTarget` receives the wished position
 * and reports whether an element took focus, so ref bookkeeping and
 * nearest-column policies live with the table that owns them.
 */

import { use, useEffect, useId, useRef, useState } from "react";

import {
  FocusGroupContext,
  type FocusDirection,
  type FocusEntry,
} from "./focus-flow";

export type FocusStop =
  | { id: string; kind: "row"; gutter?: boolean }
  | { id: string; kind: "full" }
  | { id: string; kind: "sparse"; columns: number[] };

/** A wished position; `column: "gutter"` targets a row stop's gutter lane. */
export interface FocusStopTarget {
  stopId: string;
  column: number | "gutter";
}

export interface FocusStopsOptions {
  /** Ordered stops, top to bottom; rebuilt every render by the owner. */
  stops: FocusStop[];
  columnCount: number;
  /** Focus the target; returns whether an element took focus. */
  focusTarget: (target: FocusStopTarget) => boolean;
}

export interface FocusStops {
  /** Arrow handling for the element at the given position. */
  onKeyDown: (position: FocusStopTarget) => React.KeyboardEventHandler;
  /** Reports the position that gained focus; wire to every part's onFocus. */
  onFocusTarget: (position: FocusStopTarget) => void;
  /** 0 for the table's one tabbable position, -1 for the rest. */
  tabIndexFor: (position: FocusStopTarget) => 0 | -1;
  /** Attach to the table's root element; registered while mounted. */
  attach: (element: HTMLElement | null) => void;
  /** Carry focus out of the table. Returns whether focus moved. */
  moveFrom: (
    direction: FocusDirection,
    from?: { row: number; column: number },
  ) => boolean;
}

const samePosition = (a: FocusStopTarget, b: FocusStopTarget): boolean =>
  a.stopId === b.stopId && a.column === b.column;

export function useFocusStops(options: FocusStopsOptions): FocusStops {
  const { stops, columnCount, focusTarget } = options;
  const group = use(FocusGroupContext);
  const id = useId();
  // The column vertical moves aim at, persisted across full-width stops.
  const lastColumnRef = useRef(0);
  // The roving tab stop, in state because it renders as tabIndex.
  const [tabbable, setTabbable] = useState<FocusStopTarget | null>(null);
  const [element, setElement] = useState<HTMLElement | null>(null);

  const stopIndexOf = (stopId: string): number =>
    stops.findIndex((stop) => stop.id === stopId);

  const entryColumn = (stop: FocusStop, column: number): number | "gutter" => {
    if (stop.kind === "full") {
      return 0;
    }
    if (stop.kind === "sparse") {
      if (stop.columns.length === 0) {
        return 0;
      }
      return stop.columns.reduce((best, candidate) =>
        Math.abs(candidate - column) < Math.abs(best - column)
          ? candidate
          : best,
      );
    }
    return column;
  };

  /** Focus a stop by index at the wished column; skips unfocusable stops. */
  const focusStopAt = (
    index: number,
    column: number,
    step: 1 | -1,
  ): boolean => {
    for (let at = index; at >= 0 && at < stops.length; at += step) {
      const stop = stops[at]!;
      if (focusTarget({ stopId: stop.id, column: entryColumn(stop, column) })) {
        return true;
      }
    }
    return false;
  };

  const moveVertically = (fromIndex: number, step: 1 | -1): boolean => {
    const next = fromIndex + step;
    if (next < 0 || next >= stops.length) {
      return false;
    }
    return focusStopAt(next, lastColumnRef.current, step);
  };

  const gutterRows = (): number[] =>
    stops.flatMap((stop, index) =>
      stop.kind === "row" && stop.gutter ? [index] : [],
    );

  const enter = (entry: FocusEntry): boolean => {
    if (entry.from) {
      const horizontal =
        entry.direction === "left" || entry.direction === "right";
      if (horizontal) {
        const index = Math.min(Math.max(entry.from.row, 0), stops.length - 1);
        const column = entry.direction === "right" ? 0 : columnCount - 1;
        return focusStopAt(index, column, 1) || focusStopAt(index, column, -1);
      }
      const fromEnd = entry.direction === "up";
      return focusStopAt(
        fromEnd ? stops.length - 1 : 0,
        entry.from.column,
        fromEnd ? -1 : 1,
      );
    }
    if (tabbable && focusTarget(tabbable)) {
      return true;
    }
    const fromEnd = entry.direction === "up" || entry.direction === "left";
    return focusStopAt(
      fromEnd ? stops.length - 1 : 0,
      lastColumnRef.current,
      fromEnd ? -1 : 1,
    );
  };
  const enterRef = useRef(enter);
  useEffect(() => {
    enterRef.current = enter;
  });

  useEffect(() => {
    if (element) {
      group.register(id, {
        element,
        enter: (entry) => enterRef.current(entry),
      });
    }
  });
  useEffect(() => () => group.unregister(id), [group, id]);

  const moveFrom = (
    direction: FocusDirection,
    from?: { row: number; column: number },
  ): boolean => group.moveFrom(id, direction, from);

  const onKeyDown =
    (position: FocusStopTarget): React.KeyboardEventHandler =>
    (event) => {
      const target = event.target as HTMLElement;
      const inTextField =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      const direction: FocusDirection | null =
        event.key === "ArrowDown"
          ? "down"
          : event.key === "ArrowUp"
            ? "up"
            : event.key === "ArrowRight" && !inTextField
              ? "right"
              : event.key === "ArrowLeft" && !inTextField
                ? "left"
                : null;
      if (direction === null) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const index = stopIndexOf(position.stopId);
      if (index === -1) {
        return;
      }
      const stop = stops[index]!;
      if (position.column !== "gutter") {
        lastColumnRef.current =
          stop.kind === "full" ? lastColumnRef.current : position.column;
      }
      const overflowFrom = {
        row: index,
        column:
          position.column === "gutter"
            ? 0
            : stop.kind === "full"
              ? lastColumnRef.current
              : position.column,
      };

      // The gutter lane: vertical moves stay gutter-to-gutter over row
      // stops; ArrowRight enters the line's cells at column 0.
      if (position.column === "gutter") {
        if (direction === "right") {
          focusTarget({ stopId: position.stopId, column: 0 });
          return;
        }
        if (direction === "left") {
          moveFrom("left", overflowFrom);
          return;
        }
        const lane = gutterRows();
        const at = lane.indexOf(index);
        const next = lane[at + (direction === "down" ? 1 : -1)];
        if (next !== undefined) {
          focusTarget({ stopId: stops[next]!.id, column: "gutter" });
        } else {
          moveFrom(direction, overflowFrom);
        }
        return;
      }

      if (direction === "up" || direction === "down") {
        if (!moveVertically(index, direction === "down" ? 1 : -1)) {
          moveFrom(direction, overflowFrom);
        }
        return;
      }

      // Horizontal, within the line.
      if (stop.kind === "full") {
        moveFrom(direction, overflowFrom);
        return;
      }
      const lineColumns =
        stop.kind === "sparse"
          ? stop.columns
          : Array.from({ length: columnCount }, (_, column) => column);
      const at = lineColumns.indexOf(position.column);
      const next = lineColumns[at + (direction === "right" ? 1 : -1)];
      if (next !== undefined) {
        focusTarget({ stopId: stop.id, column: next });
        return;
      }
      if (direction === "left" && stop.kind === "row" && stop.gutter) {
        focusTarget({ stopId: stop.id, column: "gutter" });
        return;
      }
      moveFrom(direction, overflowFrom);
    };

  return {
    onKeyDown,
    onFocusTarget: (position) => {
      // A full-width stop has no column of its own: recording its nominal
      // column 0 would drop the column memory it is meant to carry across.
      const stop = stops.find((candidate) => candidate.id === position.stopId);
      if (position.column !== "gutter" && stop?.kind !== "full") {
        lastColumnRef.current = position.column;
      }
      setTabbable((current) =>
        current && samePosition(current, position) ? current : position,
      );
    },
    tabIndexFor: (position) => {
      const current = tabbable ?? {
        stopId: stops[0]?.id ?? "",
        column: stops[0]?.kind === "row" && stops[0].gutter ? "gutter" : 0,
      };
      return samePosition(current, position) ? 0 : -1;
    },
    attach: setElement,
    moveFrom,
  };
}
