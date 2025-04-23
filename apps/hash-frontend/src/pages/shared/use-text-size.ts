import { type RefObject, useEffect, useState } from "react";

/**
 * This hook calculates sizes of visible text in an element, to allow for positioning elements relative to the text,
 * while accounting for text being shorter than the containing element.
 *
 * NOTE: this assumes that the text to be measured is the first child node in the element (e.g. <h1>Text<h1>)
 *
 * This hook is required because:
 * 1. The first text line may be narrower than the element, if the element hits its max width and the text is wrapped
 *    (the browser will not size the element down to the widest text line after wrapping, it will remain at the max width.)
 * 2. The last text line may be narrower than the element, if the text is wrapped and the last line does not take up the full width of the element.
 *
 * Which of the returned values are useful depends on where the consumer wants to position something against the text element:
 * 1. If at the end of the first line, use firstLineWidth
 * 2. If at the end of the last line, use lastLineWidth and lastLineTop
 * 3. If vertical centering is required, additionally use lineHeight plus any required offset to account for the height of the element being positioned.
 */
export const useTextSize = (elementRef: RefObject<HTMLElement | null>) => {
  const [size, setSize] = useState<{
    /**
     * The width of the actual text in the first line.
     */
    firstLineWidth: number;
    /**
     * The width of the actual text in the last line.
     */
    lastLineWidth: number;
    /**
     * The top of the last line, relative to the containing element.
     */
    lastLineTop: number;
    /**
     * The height of each line of text.
     */
    lineHeight: number;
  } | null>(null);

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
      range.selectNodeContents(textNode);

      const rects = range.getClientRects();

      const lastLineRect = rects[rects.length - 1];

      const firstLine = rects[0]?.width ?? 0;
      const lastLine = lastLineRect?.width ?? 0;

      const lineHeight = lastLineRect?.height ?? 0;

      const lastLineY = (rects.length - 1) * lineHeight;

      setSize({
        firstLineWidth: firstLine,
        lastLineWidth: lastLine,
        lastLineTop: lastLineY,
        lineHeight,
      });
    });

    if (elementRef.current) {
      resizeObserver.observe(elementRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [elementRef]);

  return size;
};
