/**
 * The worksheet's activation grammar for a click target that is also a
 * selectable cell: the first pointer click only selects (focuses) it, a
 * click on an already-selected target activates, and a keyboard "click"
 * (Enter/Space, which carries no pointer detail) always activates. The
 * second click of a double-click lands on an already-selected target, so
 * double-click activates without a handler of its own — important where
 * activation is not idempotent (materializing a phantom row).
 */

import { useRef } from "react";

export interface SelectFirstActivation {
  /** Record whether the target was already selected when the press began. */
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  /** Whether this click activates: a keyboard "click", or a click on an
   * already-selected target. */
  shouldActivate: (event: React.MouseEvent<HTMLElement>) => boolean;
}

/**
 * One instance serves any number of sibling targets: only one can be
 * focused at a time, and a target's pointerdown always precedes its click.
 */
export function useSelectFirstActivation(): SelectFirstActivation {
  const wasFocusedOnPointerDownRef = useRef(false);
  return {
    onPointerDown: (event) => {
      wasFocusedOnPointerDownRef.current =
        document.activeElement === event.currentTarget;
    },
    shouldActivate: (event) =>
      event.detail === 0 || wasFocusedOnPointerDownRef.current,
  };
}
