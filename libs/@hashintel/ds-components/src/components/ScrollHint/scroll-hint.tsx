import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./scroll-hint.recipe";
import { useAvoidScrollWidthChange } from "./use-avoid-scroll-width-change";

export interface ScrollHintProps {
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

/** Add a visual cue when content is scrollable. */
export const ScrollHint = ({
  className,
  children,
  vertical,
  horizontal,
  stableScrollGutter,
  onScrolledToBottom,
}: ScrollHintProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(false);

  // Called from the parent (rather than a child wrapper) so its layout effect
  // runs after the div's ref has been attached — a child's layout effect would
  // fire first, while `scrollRef.current` is still null.
  useAvoidScrollWidthChange(scrollRef, !!stableScrollGutter);

  const [edges, setEdges] = useState<EdgeState>(noEdges);

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
      top: !!vertical && scrollTop > edgeTolerance,
      bottom:
        !!vertical && scrollTop + clientHeight < scrollHeight - edgeTolerance,
      left: !!horizontal && scrollLeft > edgeTolerance,
      right:
        !!horizontal && scrollLeft + clientWidth < scrollWidth - edgeTolerance,
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
    const atBottom = !!vertical && isScrollable && !next.bottom;

    if (atBottom && !wasAtBottom.current) {
      onScrolledToBottomRef.current?.();
    }

    wasAtBottom.current = atBottom;
  }, [vertical, horizontal]);

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

  // The fade gradient depends on which edges currently overflow, so it is
  // computed per render and applied inline; the static styling (overflow,
  // positioning, mask compositing) lives in the recipe.
  const style: CSSProperties = {};

  if (hasFade) {
    const mask = buildMask(edges);
    style.maskImage = mask;
    style.WebkitMaskImage = mask;
  }

  return (
    <div
      ref={scrollRef}
      className={cx(
        styles({ vertical: !!vertical, horizontal: !!horizontal, hasFade }),
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
};
