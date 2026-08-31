/**
 * The worksheet's activation grammar for a click target that is also a
 * selectable cell: the first pointer click only selects (focuses) it, a
 * click on an already-selected target activates, and a keyboard "click"
 * (Enter/Space, which carries no pointer detail) always activates. The
 * second click of a double-click activates through its click count
 * (`event.detail` > 1) when the previous click landed on the same target,
 * so double-click needs no handler of its own — and still works in browsers
 * that do not focus buttons on pointer down (macOS Safari). Requiring the
 * same target keeps a double-click that "clicks through" a collapsing
 * overlay (a menu unmounting after its first click) from activating the
 * target revealed underneath. This matters where activation is not
 * idempotent (materializing a phantom row).
 */

import { useRef } from "react";

export interface SelectFirstActivation {
  /** Record whether the target was already selected when the press began. */
  onPointerDown: React.PointerEventHandler<HTMLElement>;
  /** Whether this click activates: a keyboard "click", a repeated click on
   * the same target, or a click on an already-selected target. Also records
   * the click's target for the repeated-click check. */
  shouldActivate: (event: React.MouseEvent<HTMLElement>) => boolean;
}

/**
 * One instance serves any number of sibling targets: only one can be
 * focused at a time, and a target's pointerdown always precedes its click.
 */
export function useSelectFirstActivation(): SelectFirstActivation {
  const wasFocusedOnPointerDownRef = useRef(false);
  const lastClickTargetRef = useRef<EventTarget | null>(null);
  return {
    onPointerDown: (event) => {
      wasFocusedOnPointerDownRef.current =
        document.activeElement === event.currentTarget;
    },
    shouldActivate: (event) => {
      const repeatedHere =
        event.detail > 1 && lastClickTargetRef.current === event.currentTarget;
      lastClickTargetRef.current = event.currentTarget;
      return (
        event.detail === 0 || repeatedHere || wasFocusedOnPointerDownRef.current
      );
    },
  };
}
