import { useRef } from "react";

import { focusLands } from "../../worksheet/focus-flow";
import { useFocusStops } from "../../worksheet/use-focus-stops";

import type { FocusFold } from "../../worksheet/focus-flow";

/**
 * Rows as a worksheet stop table of one column: one stop of the tab order,
 * its rows walked by ArrowUp and ArrowDown. A row that gives `expand` or
 * `collapse` opens on ArrowRight or closes on ArrowLeft.
 */
export const useRowStops = (rows: readonly ({ id: string } & FocusFold)[]) => {
  const targets = useRef(new Map<string, HTMLElement>());
  const { attach, onKeyDown, onFocusTarget, tabIndexFor } = useFocusStops({
    stops: rows.map((row) => ({ ...row, kind: "row" })),
    columnCount: 1,
    focusTarget: ({ stopId }) => focusLands(targets.current.get(stopId)),
  });

  return {
    /** For the element that holds the rows. */
    attach,
    /** For a row's own element: its turn in the tab order, and its arrows. */
    rowProps: (id: string) => {
      const target = { stopId: id, column: 0 };
      return {
        ref: (element: HTMLElement | null) => {
          if (element) {
            targets.current.set(id, element);
          } else {
            targets.current.delete(id);
          }
        },
        tabIndex: tabIndexFor(target),
        onFocus: () => onFocusTarget(target),
        onKeyDown: onKeyDown(target),
      };
    },
  };
};

/** What `rowProps` gives a row. */
export type RowStop = ReturnType<ReturnType<typeof useRowStops>["rowProps"]>;
