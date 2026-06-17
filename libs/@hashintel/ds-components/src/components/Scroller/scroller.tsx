import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { useAvoidScrollWidthChange } from "./use-avoid-scroll-width-change";

export interface ScrollerProps {
  className?: string;
  children: ReactNode;
  /** Allow scrolling content vertically. Defaults to `true` when no axis is set. */
  vertical?: boolean;
  /** Allow scrolling content horizontally. */
  horizontal?: boolean;
  /**
   * Prevent jank if content transitions between scrollable and non-scrollable
   * content by reserving a stable gutter for the scrollbar.
   */
  stableScrollGutter?: boolean;
  /** Called when the user scrolls to (or content settles at) the bottom edge. */
  onScrolledToBottom?: () => void;
}

/** Which edges currently have more content hidden beyond them. */
interface EdgeState {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

const noEdges: EdgeState = {
  top: false,
  bottom: false,
  left: false,
  right: false,
};

/** Size, in pixels, of the fade applied at a scrollable edge. */
const fadeSize = 24;

/** Tolerance, in pixels, for treating a scroll position as "at the edge". */
const edgeTolerance = 1;

const rootStyle = css({
  position: "relative",
  minHeight: "0",
  minWidth: "0",
});

/**
 * Build the `mask-image` that fades out content at any edge with more to
 * scroll, cueing the user that the content is scrollable. The vertical and
 * horizontal fades are composed as separate mask layers and intersected so
 * corners fade correctly when both axes overflow.
 */
const buildMask = (edges: EdgeState): string => {
  const top = edges.top ? fadeSize : 0;
  const bottom = edges.bottom ? fadeSize : 0;
  const left = edges.left ? fadeSize : 0;
  const right = edges.right ? fadeSize : 0;

  const vertical = `linear-gradient(to bottom, transparent, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent)`;
  const horizontal = `linear-gradient(to right, transparent, #000 ${left}px, #000 calc(100% - ${right}px), transparent)`;

  return `${vertical}, ${horizontal}`;
};

/**
 * Mount-gated wrapper so the scrollbar-gutter hook only runs (and only attaches
 * its observers) while `stableScrollGutter` is enabled, and cleanly releases
 * the reserved padding when it is turned off.
 */
const StableScrollGutter = ({
  targetRef,
}: {
  targetRef: RefObject<HTMLElement | null>;
}): null => {
  useAvoidScrollWidthChange(targetRef);
  return null;
};

/** Add a visual cue when content is scrollable. */
export const Scroller = ({
  className,
  children,
  vertical,
  horizontal,
  stableScrollGutter,
  onScrolledToBottom,
}: ScrollerProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(false);

  const [edges, setEdges] = useState<EdgeState>(noEdges);

  // Default to vertical scrolling unless the caller opts into an explicit axis.
  const axisSpecified = vertical !== undefined || horizontal !== undefined;
  const enableVertical = axisSpecified ? Boolean(vertical) : true;
  const enableHorizontal = Boolean(horizontal);

  const onScrolledToBottomRef = useRef(onScrolledToBottom);
  useEffect(() => {
    onScrolledToBottomRef.current = onScrolledToBottom;
  }, [onScrolledToBottom]);

  const update = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const {
      scrollTop,
      scrollLeft,
      scrollHeight,
      scrollWidth,
      clientHeight,
      clientWidth,
    } = element;

    const next: EdgeState = {
      top: enableVertical && scrollTop > edgeTolerance,
      bottom:
        enableVertical &&
        scrollTop + clientHeight < scrollHeight - edgeTolerance,
      left: enableHorizontal && scrollLeft > edgeTolerance,
      right:
        enableHorizontal &&
        scrollLeft + clientWidth < scrollWidth - edgeTolerance,
    };

    setEdges((prev) =>
      prev.top === next.top &&
      prev.bottom === next.bottom &&
      prev.left === next.left &&
      prev.right === next.right
        ? prev
        : next,
    );

    // Fire `onScrolledToBottom` once each time the bottom edge is reached, only
    // when the content is actually scrollable vertically.
    const isScrollable = scrollHeight > clientHeight + edgeTolerance;
    const atBottom = enableVertical && isScrollable && !next.bottom;

    if (atBottom && !wasAtBottom.current) {
      onScrolledToBottomRef.current?.();
    }

    wasAtBottom.current = atBottom;
  }, [enableVertical, enableHorizontal]);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    element.addEventListener("scroll", update, { passive: true });

    // Recompute when the element resizes or its content changes, since either
    // can change which edges have hidden content. ResizeObserver also invokes
    // the callback once on observe, seeding the initial edge state.
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(element);

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      element.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [update]);

  const hasFade = edges.top || edges.bottom || edges.left || edges.right;

  const style: CSSProperties = {
    overflowX: enableHorizontal ? "auto" : "hidden",
    overflowY: enableVertical ? "auto" : "hidden",
  };

  if (hasFade) {
    const mask = buildMask(edges);
    style.maskImage = mask;
    style.WebkitMaskImage = mask;
    style.maskComposite = "intersect";
    style.WebkitMaskComposite = "source-in";
  }

  return (
    <div ref={scrollRef} className={cx(rootStyle, className)} style={style}>
      {stableScrollGutter ? <StableScrollGutter targetRef={scrollRef} /> : null}
      {children}
    </div>
  );
};
