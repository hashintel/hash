import { useLayoutEffect } from "react";

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
      ? "position: fixed; overflow-y: hidden; width: 100%"
      : "";
    return () => {
      document.documentElement.style.cssText = "";
    };
  }, [active]);
