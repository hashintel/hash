import { type RefObject, useLayoutEffect } from "react";

import {
  getConsumedScrollbarHeight,
  getConsumedScrollbarWidth,
} from "./scrollbar-size";

/**
 * Probed scrollbar thickness, cached per `scrollbar-width` mode
 * (`"auto"`/`"thin"`/`"none"`) since each mode renders a different thickness.
 */
const cachedScrollbarSize = new Map<string, number>();

/**
 * Measure the browser's classic scrollbar thickness using a throwaway element.
 * Returns `0` for overlay scrollbars.
 *
 * The probe mirrors the target element's `scrollbar-width` so that a `thin`
 * scrollbar is measured as thin — otherwise the reserved gutter would be sized
 * for the default (wider) bar and wouldn't match the one that actually appears,
 * which would make the content box a different size in the two states and defeat
 * the whole point of the hook. The result is cached per mode after first use.
 *
 * @param scrollbarWidthMode - the target's computed `scrollbar-width` value.
 */
const measureScrollbarSize = (scrollbarWidthMode: string): number => {
  const mode = scrollbarWidthMode || "auto";

  const cached = cachedScrollbarSize.get(mode);
  if (cached !== undefined) {
    return cached;
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
  if (mode !== "auto") {
    probe.style.setProperty("scrollbar-width", mode);
  }

  document.body.appendChild(probe);
  const size = probe.offsetWidth - probe.clientWidth;
  document.body.removeChild(probe);

  cachedScrollbarSize.set(mode, size);
  return size;
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
 * Because the reserved inset is identical whether or not the scrollbar is
 * present, toggling the scrollbar does not change the content-box size, and so
 * cannot itself flip the scrollbar back — which is what keeps the observers from
 * oscillating. The measurement/write cycle is additionally coalesced into a
 * single animation frame and guarded by a small write threshold so sub-pixel
 * measurement noise can't thrash it.
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
    // and stops the observers from looping.
    let appliedInlineGutter: number | null = null;
    let appliedBlockGutter: number | null = null;

    // The last scrollbar thickness we saw *live* on the element, per axis. When
    // the scrollbar is absent we can't measure it, so we reserve this remembered
    // width instead — guaranteeing the reserved inset equals the width the bar
    // will occupy when it returns, which is what makes the inset constant across
    // both states (and therefore non-oscillating). Falls back to a probe until
    // we've seen a real bar at least once.
    let liveScrollbarWidth: number | null = null;
    let liveScrollbarHeight: number | null = null;

    // A live reading below this is treated as no bar rather than a real one.
    // `offsetWidth`/`clientWidth` are integer-rounded, so their difference can
    // carry up to ~1px of noise when no scrollbar is present; the thinnest real
    // scrollbar is several px, so this floor cleanly separates the two.
    const SCROLLBAR_MIN_PX = 2;

    // Only rewrite a gutter when it moves by at least this much. A real toggle
    // moves it by a whole scrollbar width; this threshold just absorbs
    // sub-pixel measurement noise so it can't rewrite frame after frame.
    const WRITE_THRESHOLD_PX = 1;

    const applyGutter = (
      side: "paddingLeft" | "paddingRight" | "paddingBottom",
      desired: number,
      applied: number | null,
      authorValue: number,
    ): number => {
      if (
        applied !== null &&
        Math.abs(desired - applied) < WRITE_THRESHOLD_PX
      ) {
        return applied;
      }
      setManagedPadding(side, desired, authorValue);
      return desired;
    };

    const sync = (): void => {
      // Single computed-style read per pass; everything below derives from it.
      const style = getComputedStyle(element);

      // The side on which the vertical scrollbar is rendered (and therefore the
      // inline side we manage the gutter on) depends on the writing direction.
      const gutterSide: "paddingLeft" | "paddingRight" =
        style.direction === "rtl" ? "paddingLeft" : "paddingRight";
      const scrollbarWidthMode = style.getPropertyValue("scrollbar-width");

      // The real scrollbar thickness is the space the bar is consuming right
      // now (see `scrollbar-size.ts`). When no bar is present it is zero.
      const liveWidth = getConsumedScrollbarWidth(element, style);
      const liveHeight = getConsumedScrollbarHeight(element, style);

      // Remember the last real bar thickness we saw, per axis, so we can reserve
      // exactly that width while the bar is absent (we can't measure it then).
      if (liveWidth > SCROLLBAR_MIN_PX) {
        liveScrollbarWidth = liveWidth;
      }
      if (liveHeight > SCROLLBAR_MIN_PX) {
        liveScrollbarHeight = liveHeight;
      }

      // Detect presence primarily from the space the bar is consuming, not from
      // `scrollHeight > clientHeight`. Those are integer-rounded, so a bar can
      // already be painted (and eating space) while a <1px overflow still rounds
      // to `scrollHeight === clientHeight`; keying off consumed space avoids that
      // blind spot and also catches always-on (`overflow: scroll`) bars. The
      // overflow comparison remains as a fallback for overlay scrollbars, which
      // overflow without consuming any space.
      const hasVerticalScrollbar =
        liveWidth > SCROLLBAR_MIN_PX ||
        element.scrollHeight > element.clientHeight;
      const hasHorizontalScrollbar =
        liveHeight > SCROLLBAR_MIN_PX ||
        element.scrollWidth > element.clientWidth;

      // Use the live width when a bar is actually consuming space; otherwise
      // fall back to the last one we saw (or a matching probe before we've ever
      // seen one). Keeping this in step with the presence check above is what
      // makes the reserved inset identical in both states.
      const scrollbarWidth =
        liveWidth > SCROLLBAR_MIN_PX
          ? liveWidth
          : (liveScrollbarWidth ?? measureScrollbarSize(scrollbarWidthMode));
      const scrollbarHeight =
        liveHeight > SCROLLBAR_MIN_PX
          ? liveHeight
          : (liveScrollbarHeight ?? measureScrollbarSize(scrollbarWidthMode));

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

      appliedInlineGutter = applyGutter(
        gutterSide,
        desiredInlineGutter,
        appliedInlineGutter,
        authorInline,
      );
      appliedBlockGutter = applyGutter(
        "paddingBottom",
        desiredBlockGutter,
        appliedBlockGutter,
        authorBlock,
      );
    };

    // Coalesce bursts of observer callbacks (e.g. many mutations in one tick)
    // into a single measurement + write on the next frame. Deferring the write
    // out of the observer's own delivery also avoids the "ResizeObserver loop
    // completed with undelivered notifications" warning.
    let frameId = 0;
    const scheduleSync = (): void => {
      if (frameId !== 0) {
        return;
      }
      if (typeof requestAnimationFrame === "undefined") {
        sync();
        return;
      }
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        sync();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(element);

    // Content changes (children added/removed/resized, text edited) can toggle a
    // scrollbar without changing the element's own box — and because the element
    // is a fixed-size scroll container, the ResizeObserver won't fire for those.
    // So we must watch the whole subtree. We deliberately do NOT observe
    // `attributes`: that would make our own padding writes re-trigger the
    // observer. The cost of the broad subtree watch is bounded by the frame
    // coalescing above (a burst of mutations still results in a single sync).
    const mutationObserver = new MutationObserver(scheduleSync);
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Run once synchronously so the gutter is correct before the first paint.
    sync();

    return () => {
      if (frameId !== 0 && typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(frameId);
      }
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
