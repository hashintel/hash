import { useEffect, useLayoutEffect } from "react";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Marks the first and last button on each visual row of a wrapped `segmented`
 * ButtonGroup with `data-row-start` / `data-row-end`, so the recipe can keep
 * the outer corner radii on every row rather than only on the DOM first/last
 * child.
 *
 * Rows are detected by comparing each child's `offsetTop`, which assumes the
 * buttons on a row share a height — true for a segmented group of same-size
 * buttons. Recomputes on container/child resize and when buttons are added or
 * removed.
 */
export const useSegmentedRows = (
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
) => {
  useIsomorphicLayoutEffect(() => {
    const container = ref.current;
    if (!enabled || !container) {
      return undefined;
    }

    const getChildren = () => Array.from(container.children) as HTMLElement[];

    const apply = () => {
      const items = getChildren();
      // Read pass: gather every measurement before writing, so the attribute
      // writes below can't invalidate layout mid-measurement (no thrash).
      const marks = items.map((item, index) => {
        const previous = items[index - 1];
        const next = items[index + 1];
        return {
          item,
          isRowStart: !previous || item.offsetTop !== previous.offsetTop,
          isRowEnd: !next || item.offsetTop !== next.offsetTop,
        };
      });
      // Write pass.
      for (const { item, isRowStart, isRowEnd } of marks) {
        item.toggleAttribute("data-row-start", isRowStart);
        item.toggleAttribute("data-row-end", isRowEnd);
      }
    };

    apply();

    // Container resize changes wrapping; a child resize (e.g. label change)
    // can too, so observe both.
    const resizeObserver = new ResizeObserver(apply);
    resizeObserver.observe(container);
    for (const item of getChildren()) {
      resizeObserver.observe(item);
    }

    const mutationObserver = new MutationObserver(() => {
      apply();
      for (const item of getChildren()) {
        resizeObserver.observe(item);
      }
    });
    mutationObserver.observe(container, { childList: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      for (const item of getChildren()) {
        item.removeAttribute("data-row-start");
        item.removeAttribute("data-row-end");
      }
    };
  }, [ref, enabled]);
};
