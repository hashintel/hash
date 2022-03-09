import { useLayoutEffect } from "react";

export const parseIntFromPixelString = (pixelString: string): number => {
  if (!pixelString.endsWith("px")) {
    throw new Error(`The pixel string "${pixelString}" doesn't end with "px"`);
  }

  return parseInt(pixelString.slice(0, -2), 10);
};

/**
 * MUI's implementation applies a padding to the body which may break the layout.
 * This version applies different yet equally effective styles to the document element.
 *
 * Used to replace the functionality behind `disableScollLock` property of MUI's
 * components modal, drawer, menu, popover, dialog.
 */
export const useScrollLock = (active: boolean) =>
  useLayoutEffect(() => {
    document.documentElement.style.cssText = active
      ? "position: fixed; overflow-y: scroll; width: 100%"
      : "";
    return () => {
      document.documentElement.style.cssText = "";
    };
  }, [active]);
