import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const sameOrder = (a: number[], b: number[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Decorates the children of a `segmented` ButtonGroup with `data-row-start` /
 * `data-row-end` so the recipe keeps the outer corner radii on the first and
 * last button of every visual row — not only the DOM first/last child.
 *
 * The attributes are applied during render, so they're correct on first paint
 * and during SSR; the layout effect only *measures* where wrapped rows break
 * and stores those indices in state. It bails out entirely when the group can't
 * wrap — `variant !== "segmented"`, or `segmented` with `noWrap` — since the
 * first/last child are then the only row edges.
 *
 * Row breaks are read from each child's `offsetTop`, which assumes the buttons
 * on a row share a height (true for same-size segmented buttons). Re-measures
 * on container/child resize and when buttons are added or removed.
 */
export const useSegmentedRows = (
  ref: React.RefObject<HTMLElement | null>,
  content: React.ReactNode,
  variant: "spaced" | "segmented",
  noWrap: boolean,
): React.ReactNode => {
  const shouldMeasure = variant === "segmented" && !noWrap;

  // Indices (> 0) that begin a new visual row; empty means a single row.
  const [rowBreaks, setRowBreaks] = useState<number[]>([]);

  useIsomorphicLayoutEffect(() => {
    if (!shouldMeasure) {
      setRowBreaks((previous) => (previous.length === 0 ? previous : []));
      return undefined;
    }

    const container = ref.current;
    if (!container) {
      return undefined;
    }

    const getChildren = () => Array.from(container.children) as HTMLElement[];

    const measure = () => {
      const items = getChildren();
      const next: number[] = [];
      for (const [index, item] of items.entries()) {
        const previous = items[index - 1];
        if (previous && item.offsetTop !== previous.offsetTop) {
          next.push(index);
        }
      }
      setRowBreaks((previous) => (sameOrder(previous, next) ? previous : next));
    };

    measure();

    // Container resize changes wrapping; a child resize (e.g. label change)
    // can too, so observe both.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    for (const item of getChildren()) {
      resizeObserver.observe(item);
    }

    const mutationObserver = new MutationObserver(() => {
      measure();
      for (const item of getChildren()) {
        resizeObserver.observe(item);
      }
    });
    mutationObserver.observe(container, { childList: true });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref, shouldMeasure]);

  if (variant !== "segmented") {
    return content;
  }

  const items = Children.toArray(content);
  const lastIndex = items.length - 1;

  return items.map((child, index) => {
    if (!isValidElement(child)) {
      return child;
    }
    const isRowStart = index === 0 || rowBreaks.includes(index);
    const isRowEnd = index === lastIndex || rowBreaks.includes(index + 1);
    return cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      "data-row-start": isRowStart ? "" : undefined,
      "data-row-end": isRowEnd ? "" : undefined,
    });
  });
};
