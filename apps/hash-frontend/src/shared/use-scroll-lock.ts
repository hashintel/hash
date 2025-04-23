import { useEffect, useLayoutEffect, useRef, useState } from "react";

const parseIntFromPixelWidth = (pixelWidth: string) =>
  parseInt(pixelWidth.replace("px", ""), 10);

/**
 * @see https://github.com/mui/material-ui/blob/master/packages/mui-utils/src/getScrollbarSize.ts
 */
const getScrollbarSizeOfDocument = () => {
  const documentWidth = document.documentElement.clientWidth;
  return Math.abs(window.innerWidth - documentWidth);
};

const useLastScrollbarSize = (element: HTMLElement) => {
  const [lastScrollbarSize, setLastScrollbarSize] = useState(0);
  const observerRef = useRef<ResizeObserver>(null);

  useEffect(() => {
    observerRef.current = new ResizeObserver(() => {
      const computedStyles = getComputedStyle(element);

      const horizontalBorderWidth =
        parseIntFromPixelWidth(computedStyles.borderLeftWidth) +
        parseIntFromPixelWidth(computedStyles.borderRightWidth);

      const scrollbarSize =
        element !== document.body
          ? element.offsetWidth - element.clientWidth - horizontalBorderWidth
          : getScrollbarSizeOfDocument();

      setLastScrollbarSize(scrollbarSize);
    });

    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [element]);

  return lastScrollbarSize;
};

const removeStylesFromElement = (element: HTMLElement) => {
  element.style.removeProperty("overflow");
  element.style.removeProperty("padding-right");
};

/**
 * This function does the same thing as MUI's scroll-lock mechanism, but in a hook.
 * So we can use the same scroll-lock at custom components
 * @param active is locked
 * @param elementToLock an HTML element to lock it's scroll. Locks `document.body` if it's left empty
 */
export const useScrollLock = (
  active: boolean,
  elementToLock: HTMLElement = document.body,
) => {
  const scrollbarSize = useLastScrollbarSize(elementToLock);

  const madeChangesRequiringRemoval = useRef(false);

  useLayoutEffect(() => {
    const overflow = elementToLock.style.overflow;

    const overflowWasAlreadyHidden = overflow === "hidden";

    if (active && scrollbarSize && !overflowWasAlreadyHidden) {
      elementToLock.style.setProperty("padding-right", `${scrollbarSize}px`);
      elementToLock.style.setProperty("overflow", `hidden`);
      madeChangesRequiringRemoval.current = true;
    }

    return () => {
      if (madeChangesRequiringRemoval.current) {
        removeStylesFromElement(elementToLock);
        madeChangesRequiringRemoval.current = false;
      }
    };
  }, [active, scrollbarSize, elementToLock]);
};
