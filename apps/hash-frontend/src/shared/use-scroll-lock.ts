import { useLayoutEffect } from "react";

const parseIntFromPixelWidth = (pixelWidth: string) =>
  parseInt(pixelWidth.replace("px", ""), 10);

/**
 * @see https://github.com/mui/material-ui/blob/master/packages/mui-utils/src/getScrollbarSize.ts
 */
const getScrollbarSizeOfDocument = () => {
  const documentWidth = document.documentElement.clientWidth;
  return Math.abs(window.innerWidth - documentWidth);
};

const getScrollbarSize = (element: HTMLElement) => {
  if (element === document.body) {
    return getScrollbarSizeOfDocument();
  }

  const computedStyles = getComputedStyle(element);

  const horizontalBorderWidth =
    parseIntFromPixelWidth(computedStyles.borderLeftWidth) +
    parseIntFromPixelWidth(computedStyles.borderRightWidth);

  return element.offsetWidth - element.clientWidth - horizontalBorderWidth;
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
) => {
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
