/**
 * Scrollbar measurement shared by the scroll-related hooks in this directory
 * (`useScrollLock`, `useAvoidScrollWidthChange`).
 */

/**
 * The horizontal space a classic (non-overlay) vertical scrollbar is
 * *currently* consuming inside `element`: the difference between the element's
 * border box and its (padding-inclusive) client box on the horizontal axis,
 * minus the borders. When no bar is present — or the platform renders overlay
 * scrollbars — that difference is zero.
 *
 * @param element - the element whose scrollbar to measure.
 * @param style - the element's computed style, so callers that have already
 *   read it can avoid a second `getComputedStyle` call.
 */
export const getConsumedScrollbarWidth = (
  element: HTMLElement,
  style: CSSStyleDeclaration = getComputedStyle(element),
): number => {
  const borderX =
    parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);

  return element.offsetWidth - element.clientWidth - borderX;
};

/**
 * The vertical space a classic (non-overlay) horizontal scrollbar is
 * *currently* consuming inside `element` — the vertical-axis counterpart of
 * {@link getConsumedScrollbarWidth}.
 *
 * @param element - the element whose scrollbar to measure.
 * @param style - the element's computed style, so callers that have already
 *   read it can avoid a second `getComputedStyle` call.
 */
export const getConsumedScrollbarHeight = (
  element: HTMLElement,
  style: CSSStyleDeclaration = getComputedStyle(element),
): number => {
  const borderY =
    parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

  return element.offsetHeight - element.clientHeight - borderY;
};

/**
 * The space the document-level (viewport) scrollbar is currently consuming.
 * The document scrollbar lives on the viewport rather than on an element's
 * border box, so it needs its own measurement.
 *
 * @see https://github.com/mui/material-ui/blob/master/packages/mui-utils/src/getScrollbarSize.ts
 */
export const getDocumentScrollbarSize = (): number =>
  Math.abs(window.innerWidth - document.documentElement.clientWidth);
