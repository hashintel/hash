import { type RefObject, useEffect, useState } from "react";

/**
 * If an element contains text and its maximum width forces wrapping, the element will remain at the max width,
 * and the longest line of text may be shorter than the element (the browser does not size the element down to the text.)
 *
 * This means that elements positioned to the right of the text-containing element may appear visually far away from the text.
 *
 * This hook calculates the width of the text within the element, to allow for positioning elements relative to the text itself.
 *
 * NOTE: this assumes that the text to be measured is the first node in the element.
 */
export const useTextWidth = (elementRef: RefObject<HTMLElement | null>) => {
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];

      if (!entry) {
        return;
      }

      const element = entry.target;
      const textNode = element.firstChild;

      if (!textNode) {
        return;
      }

      const range = document.createRange();
      range.setStartBefore(textNode);
      range.setEndAfter(textNode);
      const textWidth = range.getBoundingClientRect().width;
      setWidth(textWidth);
    });

    if (elementRef.current) {
      resizeObserver.observe(elementRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [elementRef]);

  return width;
};
