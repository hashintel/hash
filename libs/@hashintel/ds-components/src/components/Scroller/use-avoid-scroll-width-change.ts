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
 * This hook keeps the content's inset constant across both states so they
 * expose the same internal size. The inset is held at the larger of the
 * element's existing padding and the scrollbar's thickness, on each axis
 * independently:
 * - while a scrollbar is absent the managed padding covers the whole inset;
 * - while it is present the scrollbar itself occupies part of the inset, so the
 *   managed padding shrinks to cover only the remainder.
 *
 * The gutter is managed on `padding-right` (`padding-left` in RTL) for a
 * vertical scrollbar, keeping the internal width stable, and on
 * `padding-bottom` for a horizontal scrollbar, keeping the internal height
 * stable.
 *
 * Crucially, this respects any padding the element already has. Rather than
 * clobbering the author's padding, the appearing scrollbar *consumes* it: if
 * the element has 16px of padding and the scrollbar is 15px, the scrollbar sits
 * within that padding and the content never moves, with 1px of padding left
 * over. Only when the existing padding is smaller than the scrollbar does the
 * hook reserve the extra space, so the content still does not jump.
 *
 * Both axes are handled independently and detected automatically, so the hook
 * works whether the element scrolls vertically, horizontally, or both.
 *
 * On platforms with overlay scrollbars (e.g. macOS by default) the measured
 * scrollbar thickness is `0`, so the hook is a no-op.
 *
 * @param ref - ref to the scrollable element to stabilise.
 * @param enabled - whether to apply the gutter; when `false` the hook is a
 *   no-op and releases any padding it previously reserved.
 */
export const useAvoidScrollWidthChange = (
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void => {
  useLayoutEffect(() => {
    const element = ref.current;

    if (!enabled || !element || typeof ResizeObserver === "undefined") {
      return;
    }

    /**
     * The side on which the vertical scrollbar is rendered (and therefore the
     * inline side we manage the gutter on) depends on the writing direction.
     */
    const inlineGutterSide = (): "paddingLeft" | "paddingRight" =>
      getComputedStyle(element).direction === "rtl"
        ? "paddingLeft"
        : "paddingRight";

    // The element's own padding, captured before we touch it. A scrollbar that
    // appears should consume this padding rather than be reserved on top of it,
    // so we need to know how much padding the author already asked for.
    const initialStyle = getComputedStyle(element);
    const authorPadding = {
      paddingLeft: parseFloat(initialStyle.paddingLeft) || 0,
      paddingRight: parseFloat(initialStyle.paddingRight) || 0,
      paddingBottom: parseFloat(initialStyle.paddingBottom) || 0,
    };

    // The element's own *inline* padding declarations, so we can hand authority
    // back to the author (and any stylesheet rules) on cleanup, and whenever our
    // desired padding happens to coincide with theirs.
    const initialInlinePadding = {
      paddingLeft: element.style.paddingLeft,
      paddingRight: element.style.paddingRight,
      paddingBottom: element.style.paddingBottom,
    };

    // Write a managed padding value, but defer to the author's own declaration
    // when our desired value matches theirs, so we never needlessly clobber a
    // stylesheet rule (and so overlay-scrollbar platforms stay a true no-op).
    const setManagedPadding = (
      side: "paddingLeft" | "paddingRight" | "paddingBottom",
      desired: number,
      authorValue: number,
    ): void => {
      element.style[side] =
        desired === authorValue ? initialInlinePadding[side] : `${desired}px`;
    };

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
      // minus the borders, read live while the scrollbar is present. When it is
      // absent that difference is zero, so we fall back to a probe measurement.
      const borderX =
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      const borderY =
        parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

      const liveWidth = element.offsetWidth - element.clientWidth - borderX;
      const scrollbarWidth = liveWidth > 0 ? liveWidth : measureScrollbarSize();

      const liveHeight = element.offsetHeight - element.clientHeight - borderY;
      const scrollbarHeight =
        liveHeight > 0 ? liveHeight : measureScrollbarSize();

      const gutterSide = inlineGutterSide();
      const authorInline = authorPadding[gutterSide];
      const authorBlock = authorPadding.paddingBottom;

      // Hold the inline inset constant at `max(authorPadding, scrollbarWidth)`.
      // While the scrollbar is present it occupies `scrollbarWidth` of that
      // inset, so the managed padding only needs to cover the rest (which is the
      // author's leftover padding, if it exceeded the scrollbar). While absent
      // the padding covers the whole inset.
      const desiredInlineGutter = hasVerticalScrollbar
        ? Math.max(authorInline - scrollbarWidth, 0)
        : Math.max(authorInline, scrollbarWidth);

      // Likewise for the block inset and a horizontal scrollbar.
      const desiredBlockGutter = hasHorizontalScrollbar
        ? Math.max(authorBlock - scrollbarHeight, 0)
        : Math.max(authorBlock, scrollbarHeight);

      if (desiredInlineGutter !== appliedInlineGutter) {
        appliedInlineGutter = desiredInlineGutter;
        setManagedPadding(gutterSide, desiredInlineGutter, authorInline);
      }

      if (desiredBlockGutter !== appliedBlockGutter) {
        appliedBlockGutter = desiredBlockGutter;
        setManagedPadding("paddingBottom", desiredBlockGutter, authorBlock);
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
      // Restore whatever inline padding the author had (usually none), handing
      // control back to their stylesheet rather than leaving our values behind.
      element.style.paddingLeft = initialInlinePadding.paddingLeft;
      element.style.paddingRight = initialInlinePadding.paddingRight;
      element.style.paddingBottom = initialInlinePadding.paddingBottom;
    };
  }, [ref, enabled]);
};
