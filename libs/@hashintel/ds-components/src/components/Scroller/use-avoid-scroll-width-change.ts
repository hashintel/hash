import { type RefObject, useLayoutEffect } from "react";

let cachedScrollbarSize: number | null = null;

/**
 * Measure the browser's classic scrollbar thickness using a throwaway element.
 * Returns `0` for overlay scrollbars. The result is cached after first use.
 */
const measureScrollbarSize = (): number => {
  if (cachedScrollbarSize !== null) {
    return cachedScrollbarSize;
  }

  if (typeof document === "undefined") {
    return 0;
  }

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.top = "-9999px";
  probe.style.width = "100px";
  probe.style.height = "100px";
  probe.style.overflow = "scroll";

  document.body.appendChild(probe);
  cachedScrollbarSize = probe.offsetWidth - probe.clientWidth;
  document.body.removeChild(probe);

  return cachedScrollbarSize;
};

/**
 * Keep the internal (content) size of a scrollable element constant as its
 * scrollbars appear and disappear, on either axis.
 *
 * A classic (non-overlay) scrollbar consumes part of the element's client box:
 * a vertical scrollbar eats into the client width, a horizontal scrollbar eats
 * into the client height. So when content grows large enough to need scrolling,
 * the space available to children shrinks — and snaps back when it no longer
 * needs to scroll. This causes a visible jump ("jank").
 *
 * This hook reserves a gutter equal to the scrollbar's thickness while no
 * scrollbar is present, so the content box matches the scrollbar-present state.
 * The two states therefore expose the same internal size:
 * - a vertical scrollbar's gutter is reserved via `padding-right`
 *   (`padding-left` in RTL), keeping the internal width stable;
 * - a horizontal scrollbar's gutter is reserved via `padding-bottom`, keeping
 *   the internal height stable.
 *
 * Both axes are handled independently and detected automatically, so the hook
 * works whether the element scrolls vertically, horizontally, or both.
 *
 * On platforms with overlay scrollbars (e.g. macOS by default) the measured
 * scrollbar thickness is `0`, so the hook is a no-op.
 *
 * @param ref - ref to the scrollable element to stabilise.
 */
export const useAvoidScrollWidthChange = (
  ref: RefObject<HTMLElement | null>,
): void => {
  useLayoutEffect(() => {
    const element = ref.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    /**
     * The side on which the vertical scrollbar is rendered (and therefore the
     * inline side we reserve a gutter on) depends on the writing direction.
     */
    const inlineGutterSide = (): "paddingLeft" | "paddingRight" =>
      getComputedStyle(element).direction === "rtl"
        ? "paddingLeft"
        : "paddingRight";

    // Track the values we last wrote, per axis, so repeated observer callbacks
    // that don't change anything are skipped — this lets the layout converge
    // and stops the ResizeObserver from looping.
    let appliedInlineGutter: number | null = null;
    let appliedBlockGutter: number | null = null;

    const sync = (): void => {
      const hasVerticalScrollbar = element.scrollHeight > element.clientHeight;
      const hasHorizontalScrollbar = element.scrollWidth > element.clientWidth;

      const style = getComputedStyle(element);

      // The real scrollbar thickness is the difference between the element's
      // border box and its (padding-inclusive) client box on the relevant axis,
      // minus the borders — but only while that scrollbar is present. When it is
      // absent we fall back to a probe measurement to know how much to reserve.
      const borderX =
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      const borderY =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

      // A vertical scrollbar reduces the width, so reserve an inline gutter
      // only while it is absent.
      let desiredInlineGutter = 0;
      if (!hasVerticalScrollbar) {
        const liveWidth = element.offsetWidth - element.clientWidth - borderX;
        desiredInlineGutter =
          liveWidth > 0 ? liveWidth : measureScrollbarSize();
      }

      // A horizontal scrollbar reduces the height, so reserve a block gutter
      // only while it is absent.
      let desiredBlockGutter = 0;
      if (!hasHorizontalScrollbar) {
        const liveHeight =
          element.offsetHeight - element.clientHeight - borderY;
        desiredBlockGutter =
          liveHeight > 0 ? liveHeight : measureScrollbarSize();
      }

      if (desiredInlineGutter !== appliedInlineGutter) {
        appliedInlineGutter = desiredInlineGutter;
        element.style[inlineGutterSide()] = desiredInlineGutter
          ? `${desiredInlineGutter}px`
          : "";
      }

      if (desiredBlockGutter !== appliedBlockGutter) {
        appliedBlockGutter = desiredBlockGutter;
        element.style.paddingBottom = desiredBlockGutter
          ? `${desiredBlockGutter}px`
          : "";
      }
    };

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(element);

    // Content changes (children added/removed/resized) can toggle a scrollbar
    // without changing the element's own box, so watch the subtree too.
    const mutationObserver = new MutationObserver(sync);
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    sync();

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      element.style[inlineGutterSide()] = "";
      element.style.paddingBottom = "";
    };
  }, [ref]);
};
