/**
 * The last-focused position of a grid or a stops table, kept for its two
 * readers.
 *
 * A move that enters the member asks `recall` from a key handler, so the
 * position lives in a ref and remembering it renders nothing. The roving tab
 * stop draws the position as `tabIndex`, so in that mode the position is
 * state as well, and a move of the focus renders the member's owner once.
 */

import { useRef, useState } from "react";

/**
 * "roving" makes the member one tab stop: `tabIndexFor` answers 0 for the
 * last-focused position and -1 for the rest, which takes a render per move
 * of the focus. "native" is for a member whose cells keep their own tab
 * stops and that never calls `tabIndexFor`: a move of the focus renders
 * nothing.
 */
export type FocusTabStop = "roving" | "native";

interface FocusMemory<Position> {
  /** Records the position that took focus. */
  remember: (position: Position) => void;
  /** The last-focused position, for a handler; null until one took focus. */
  recall: () => Position | null;
  /** The last-focused position as rendered. Stays null under "native". */
  tabbable: Position | null;
}

export const useFocusMemory = <Position>(
  tabStop: FocusTabStop,
  isSame: (a: Position, b: Position) => boolean,
): FocusMemory<Position> => {
  const remembered = useRef<Position | null>(null);
  const [tabbable, setTabbable] = useState<Position | null>(null);
  return {
    remember: (position) => {
      remembered.current = position;
      if (tabStop === "roving") {
        setTabbable((current) =>
          current !== null && isSame(current, position) ? current : position,
        );
      }
    },
    recall: () => remembered.current,
    tabbable,
  };
};
