/**
 * The vocabulary of the worksheet's keyboard flow: directions, entry
 * descriptors, and the member contract every focusable unit (a grid, a
 * header, a lone cell) fulfils toward its enclosing `FocusStack`.
 *
 * The model is a tree. `FocusStack` nodes give the tree its geometry
 * (horizontal or vertical); members are its leaves. An arrow move that runs
 * off a member's edge asks the nearest enclosing stack to carry focus to a
 * sibling along that axis; a stack at its own edge asks its parent, unless
 * it `contain`s the walk. A move nobody accepts leaves focus where it is —
 * the canonical data-grid outcome.
 */

import { createContext } from "react";

export type FocusAxis = "horizontal" | "vertical";
export type FocusDirection = "up" | "down" | "left" | "right";

/** The axis a direction moves along. */
export const focusAxisOf = (direction: FocusDirection): FocusAxis =>
  direction === "left" || direction === "right" ? "horizontal" : "vertical";

/** Whether a direction moves toward later document order on its axis. */
export const focusForward = (direction: FocusDirection): boolean =>
  direction === "down" || direction === "right";

/**
 * The direction an arrow key asks for. Null for any other key, and for a
 * horizontal arrow in a text field, where it moves the caret.
 */
export const arrowDirection = (
  event: React.KeyboardEvent,
): FocusDirection | null => {
  const target = event.target as HTMLElement;
  const inTextField =
    target.tagName === "INPUT" || target.tagName === "TEXTAREA";
  return event.key === "ArrowDown"
    ? "down"
    : event.key === "ArrowUp"
      ? "up"
      : event.key === "ArrowRight" && !inTextField
        ? "right"
        : event.key === "ArrowLeft" && !inTextField
          ? "left"
          : null;
};

/**
 * How an arriving move lands inside a member: the direction it travels
 * (entering downward means arriving at the top), and — under a stack's
 * `entry="aligned"` policy — the position it left from, so a grid can keep
 * the row of a horizontal move or the column of a vertical one.
 */
export interface FocusEntry {
  direction: FocusDirection;
  from?: { row: number; column: number };
}

/**
 * What the horizontal arrows do on something that folds, in place of moving:
 * ArrowRight calls `expand` and ArrowLeft calls `collapse`. Give the one that
 * applies now. A collapsed thing has only `expand`, so ArrowLeft on it is a
 * move like any other, and ArrowRight is one on an expanded thing.
 */
export interface FocusFold {
  expand?: () => void;
  collapse?: () => void;
}

export interface FocusMemberHandle {
  /** The member's mounted element, for document-order sorting. */
  element: HTMLElement;
  /** Move focus into the member. Returns whether focus landed. */
  enter: (entry: FocusEntry) => boolean;
}

/** What a stack offers the members (and child stacks) inside it. */
export interface FocusGroup {
  register: (id: string, handle: FocusMemberHandle) => void;
  unregister: (id: string) => void;
  /**
   * Carry focus from the given member toward `direction`. Returns whether
   * focus moved; false leaves focus where it is.
   */
  moveFrom: (
    id: string,
    direction: FocusDirection,
    from?: { row: number; column: number },
  ) => boolean;
}

/** Outside any stack: every move is refused and focus stays put. */
export const BOUNDARY_FOCUS_GROUP: FocusGroup = {
  register: () => {},
  unregister: () => {},
  moveFrom: () => false,
};

export const FocusGroupContext =
  createContext<FocusGroup>(BOUNDARY_FOCUS_GROUP);

/** Focuses an element, reporting whether focus actually landed on it. */
export function focusLands(element: HTMLElement | null | undefined): boolean {
  if (!element) {
    return false;
  }
  element.focus();
  return document.activeElement === element;
}
