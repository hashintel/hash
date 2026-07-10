import { useLayoutEffect } from "react";

import {
  getConsumedScrollbarWidth,
  getDocumentScrollbarSize,
} from "./scrollbar-size";

const getScrollbarSize = (element: HTMLElement): number => {
  if (element === document.body) {
    return getDocumentScrollbarSize();
  }

  return getConsumedScrollbarWidth(element);
};

/**
 * This function does the same thing as MUI's scroll-lock mechanism, but in a hook.
 * So we can use the same scroll-lock at custom components
 *
 * The scrollbar size is measured once, when the lock is applied, NOT tracked live.
 * Live-tracking it (e.g. via a ResizeObserver) re-measures while the lock itself has
 * hidden the scrollbar, which reads 0 and releases the lock, whose removal restores
 * the scrollbar, which measures non-zero and re-applies the lock, and so on — an
 * infinite loop that toggles the document scrollbar every frame whenever hiding it
 * changes the locked element's box by any amount (which happens at fractional
 * device-pixel-ratios, where the scrollbar's true width is not a whole number of
 * CSS pixels but the measured/compensated width is).
 *
 * @param active is locked
 * @param elementToLock an HTML element to lock it's scroll. Locks `document.body` if it's left empty
 */
export const useScrollLock = (
  active: boolean,
  elementToLock: HTMLElement = document.body,
): void => {
  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    const overflowWasAlreadyHidden = elementToLock.style.overflow === "hidden";

    const scrollbarSize = getScrollbarSize(elementToLock);

    if (!scrollbarSize || overflowWasAlreadyHidden) {
      return;
    }

    elementToLock.style.setProperty("padding-right", `${scrollbarSize}px`);
    elementToLock.style.setProperty("overflow", "hidden");

    return () => {
      elementToLock.style.removeProperty("overflow");
      elementToLock.style.removeProperty("padding-right");
    };
  }, [active, elementToLock]);
};
