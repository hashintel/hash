/**
 * Marks a file preview's search hits with the CSS Custom Highlight API.
 * `globals.scss` styles the two highlights. `CSS.highlights` is one registry
 * for the whole document, so only one preview can show search hits at a time.
 */

const hitHighlightName = "file-preview-hit";
const currentHitHighlightName = "file-preview-current-hit";

/**
 * A point in the text of `element`, counted in characters across all of its
 * text nodes.
 */
export type TextPosition = {
  element: Element;
  offset: number;
};

const textBoundary = (
  { element, offset }: TextPosition,
  edge: "start" | "end",
): { node: Node; offset: number } => {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
  );
  let remainingOffset = Math.max(0, offset);
  let lastTextNode: Node | null = null;

  for (
    let textNode = walker.nextNode();
    textNode;
    textNode = walker.nextNode()
  ) {
    const length = textNode.nodeValue?.length ?? 0;
    if (
      remainingOffset < length ||
      (edge === "end" && remainingOffset === length)
    ) {
      return { node: textNode, offset: remainingOffset };
    }
    remainingOffset -= length;
    lastTextNode = textNode;
  }

  return lastTextNode
    ? { node: lastTextNode, offset: lastTextNode.nodeValue?.length ?? 0 }
    : { node: element, offset: 0 };
};

/**
 * Returns a `Range` from `start` to `end`. An offset past the end of an
 * element's text is treated as its end.
 */
export const createHitRange = (
  start: TextPosition,
  end: TextPosition,
): Range => {
  const range = start.element.ownerDocument.createRange();
  const startBoundary = textBoundary(start, "start");
  const endBoundary = textBoundary(end, "end");
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);
  return range;
};

/** Marks every hit, and `currentHit` over them. Replaces any earlier marks. */
export const showSearchHits = (hits: Range[], currentHit: Range | null) => {
  if (!("highlights" in CSS)) {
    return;
  }

  CSS.highlights.set(hitHighlightName, new Highlight(...hits));

  if (currentHit) {
    const currentHitHighlight = new Highlight(currentHit);
    currentHitHighlight.priority = 1;
    CSS.highlights.set(currentHitHighlightName, currentHitHighlight);
  } else {
    CSS.highlights.delete(currentHitHighlightName);
  }
};

export const clearSearchHits = () => {
  if (!("highlights" in CSS)) {
    return;
  }

  CSS.highlights.delete(hitHighlightName);
  CSS.highlights.delete(currentHitHighlightName);
};

const scrollDistanceToCentre = (
  hitStart: number,
  hitEnd: number,
  visibleStart: number,
  visibleEnd: number,
) =>
  hitStart >= visibleStart && hitEnd <= visibleEnd
    ? 0
    : (hitStart + hitEnd) / 2 - (visibleStart + visibleEnd) / 2;

/**
 * Scrolls `scrollContainer` along each axis on which `hit` is not fully
 * visible, so that the hit ends up in the middle.
 */
export const scrollHitIntoView = (hit: Range, scrollContainer: Element) => {
  if (hit.collapsed) {
    return;
  }

  const hitBox = hit.getBoundingClientRect();
  const containerBox = scrollContainer.getBoundingClientRect();
  const visibleTop = containerBox.top + scrollContainer.clientTop;
  const visibleLeft = containerBox.left + scrollContainer.clientLeft;

  scrollContainer.scrollBy({
    top: scrollDistanceToCentre(
      hitBox.top,
      hitBox.bottom,
      visibleTop,
      visibleTop + scrollContainer.clientHeight,
    ),
    left: scrollDistanceToCentre(
      hitBox.left,
      hitBox.right,
      visibleLeft,
      visibleLeft + scrollContainer.clientWidth,
    ),
  });
};
