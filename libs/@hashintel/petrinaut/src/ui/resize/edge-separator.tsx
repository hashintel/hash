import { Separator } from "react-resizable-panels";

import { cx } from "@hashintel/ds-helpers/css";

import { edgeSeparatorStyle } from "./edge-separator-style";

import type { FocusEvent, Ref } from "react";

// Whether the user last pressed a pointer or a key. Heard on the window while
// the event travels down, so before the library hears a press on the document.
let lastInput: "pointer" | "key" = "key";
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    () => {
      lastInput = "pointer";
    },
    true,
  );
  window.addEventListener(
    "keydown",
    () => {
      lastInput = "key";
    },
    true,
  );
}

/**
 * The library focuses a separator that is pressed. A press then takes the
 * focus from where the user was typing, keeps the strip painted as focused
 * after the drag, and sends the next arrow key to the separator. Focus that
 * arrives with a press goes back to where it was; the Tab key still reaches
 * the separator.
 */
const returnFocusAfterPress = (event: FocusEvent<HTMLDivElement>) => {
  if (lastInput !== "pointer") {
    return;
  }
  // The library does not hear of this focus, so it does not mark the
  // separator as focused once the focus has gone back.
  event.stopPropagation();
  if (event.relatedTarget instanceof HTMLElement) {
    event.relatedTarget.focus({ preventScroll: true });
  } else {
    event.currentTarget.blur();
  }
};

/**
 * A separator of `react-resizable-panels` on the edge of a panel: a line with
 * no thickness, a strip around it that a pointer grabs, and the strip that
 * tints on hover and turns blue while it is dragged.
 */
export const EdgeSeparator = ({
  edge,
  label,
  paintsBorder = true,
  disabled,
  className,
  elementRef,
}: {
  /** Where the panel it resizes lies: see `edgeSeparatorStyle`. */
  edge: "left" | "right" | "bottom" | "top";
  /** The separator's accessible name. */
  label: string;
  /** Whether a drag paints the panel's border, which lies under the strip. */
  paintsBorder?: boolean;
  disabled?: boolean;
  className?: string;
  elementRef?: Ref<HTMLDivElement>;
}) => (
  <Separator
    elementRef={elementRef}
    aria-label={label}
    disabled={disabled}
    disableDoubleClick
    className={cx(edgeSeparatorStyle({ edge, paintsBorder }), className)}
    onFocusCapture={returnFocusAfterPress}
  />
);
