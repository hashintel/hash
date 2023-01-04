import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * @see https://github.com/mui/material-ui/blob/master/packages/mui-utils/src/getScrollbarSize.ts
 */
const getScrollbarSizeOfDocument = () => {
  const documentWidth = document.documentElement.clientWidth;
  return Math.abs(window.innerWidth - documentWidth);
};

const useLastScrollbarSize = (element: HTMLElement) => {
  const [lastScrollbarSize, setLastScrollbarSize] = useState(0);
  const observerRef = useRef<ResizeObserver>();

  useEffect(() => {
    observerRef.current = new ResizeObserver(() => {
      const scrollbarSize =
        element !== document.body
          ? element.offsetWidth - element.clientWidth
          : getScrollbarSizeOfDocument();

      if (scrollbarSize > 0) {
        setLastScrollbarSize(scrollbarSize);
      }
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

  useLayoutEffect(() => {
    if (active && scrollbarSize) {
      elementToLock.style.setProperty("padding-right", `${scrollbarSize}px`);
      elementToLock.style.setProperty("overflow", `hidden`);
    } else {
      removeStylesFromElement(elementToLock);
    }

    return () => removeStylesFromElement(elementToLock);
  }, [active, scrollbarSize, elementToLock]);
};
