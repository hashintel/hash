import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * @see https://github.com/mui/material-ui/blob/master/packages/mui-utils/src/getScrollbarSize.ts
 */
const getScrollbarSizeOfDocument = () => {
  const documentWidth = document.documentElement.clientWidth;
  return Math.abs(window.innerWidth - documentWidth);
};

const useLastScrollbarSize = (element?: HTMLElement) => {
  const [lastScrollbarSize, setLastScrollbarSize] = useState(0);
  const observerRef = useRef<ResizeObserver>();

  useEffect(() => {
    observerRef.current = new ResizeObserver(() => {
      const scrollbarSize = element
        ? element.offsetWidth - element.clientWidth
        : getScrollbarSizeOfDocument();

      if (scrollbarSize > 0) {
        setLastScrollbarSize(scrollbarSize);
      }
    });

    observerRef.current.observe(element ?? document.body);

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
export const useScrollLock = (active: boolean, elementToLock?: HTMLElement) => {
  const scrollbarSize = useLastScrollbarSize(elementToLock);

  useLayoutEffect(() => {
    const element = elementToLock ?? document.body;
    if (active && scrollbarSize) {
      element.style.setProperty("padding-right", `${scrollbarSize}px`);
      element.style.setProperty("overflow", `hidden`);
    } else {
      removeStylesFromElement(element);
    }

    return () => removeStylesFromElement(element);
  }, [active, scrollbarSize, elementToLock]);
};
