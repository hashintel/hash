import { useRef } from "react";

import { focusLands } from "./focus-flow";

import type { FocusStopTarget } from "./use-focus-stops";

interface StopTargets {
  /** The ref callback for the element rendered at a position. */
  register: (target: FocusStopTarget) => (element: HTMLElement | null) => void;
  /** Focuses the element at a position; false when none took focus. */
  focus: (target: FocusStopTarget) => boolean;
}

const keyOf = ({ stopId, column }: FocusStopTarget): string =>
  `${stopId}:${column}`;

/**
 * The elements a table renders for the positions of `useFocusStops`.
 *
 * The map lives in a hook because a function that writes a ref and is created
 * in a component's `map` keeps the compiler from caching the rows.
 */
export const useStopTargets = (): StopTargets => {
  const elements = useRef(new Map<string, HTMLElement>());

  return {
    register: (target) => (element) => {
      if (element) {
        elements.current.set(keyOf(target), element);
      } else {
        elements.current.delete(keyOf(target));
      }
    },
    focus: (target) => focusLands(elements.current.get(keyOf(target))),
  };
};
