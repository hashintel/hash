import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * @see https://github.com/mui/material-ui/blob/master/packages/mui-utils/src/getScrollbarSize.ts
 */
const getScrollbarSize = (doc: Document) => {
  const documentWidth = doc.documentElement.clientWidth;
  return Math.abs(window.innerWidth - documentWidth);
};

const useLastScrollbarSize = () => {
  const [lastScrollbarSize, setLastScrollbarSize] = useState(0);
  const observerRef = useRef<ResizeObserver>();

  useEffect(() => {
    observerRef.current = new ResizeObserver(() => {
      const scrollbarSize = getScrollbarSize(document);

      if (scrollbarSize > 0) {
        setLastScrollbarSize(scrollbarSize);
      }
    });

    observerRef.current.observe(document.body);

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return lastScrollbarSize;
};

const removeBodyStyles = () => {
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
};

/**
 * This function does the same thing as MUI's scroll-lock mechanism, but in a hook.
 * So we can use the same scroll-lock at custom components
 */
export const useScrollLock = (active: boolean) => {
  const scrollbarSize = useLastScrollbarSize();

  useLayoutEffect(() => {
    if (active && scrollbarSize) {
      document.body.style.setProperty("padding-right", `${scrollbarSize}px`);
      document.body.style.setProperty("overflow", `hidden`);
    } else {
      removeBodyStyles();
    }

    return () => removeBodyStyles();
  }, [active, scrollbarSize]);
};
