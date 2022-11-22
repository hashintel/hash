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

/**
 * This function does the same thing as MUI's scroll-lock mechanism, but in a hook.
 * So we can use the same scroll-lock at custom components
 */
export const useScrollLock = (active: boolean) => {
  const scrollbarSize = useLastScrollbarSize();

  useLayoutEffect(() => {
    document.body.style.cssText =
      active && scrollbarSize
        ? `padding-right: ${scrollbarSize}px; overflow: hidden;`
        : "";
    return () => {
      document.body.style.cssText = "";
    };
  }, [active, scrollbarSize]);
};
