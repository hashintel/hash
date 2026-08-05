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

  const items = Children.toArray(content);
  // Only element children map 1:1 (and in order) to the DOM element nodes the
  // effect measures; text/whitespace children render to skipped text nodes.
  const elements = items.filter(isValidElement);
  const elementCount = elements.length;

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

    let hasWarnedMismatch = false;

    const measure = () => {
      const measured = getChildren();

      // Row roles are applied per element child at render but measured per DOM
      // element node here; they only align when each child renders exactly one
      // element. A child that renders `null`, a fragment, or several elements
      // breaks that and rounds the wrong buttons. Warn (dev only, once).
      // `process` may be undefined under some bundlers — treat that as non-prod.
      const isProduction =
        typeof process !== "undefined" &&
        // eslint-disable-next-line dot-notation -- bracket required by noPropertyAccessFromIndexSignature
        process.env["NODE_ENV"] === "production";
      if (
        !isProduction &&
        !hasWarnedMismatch &&
        measured.length !== elementCount
      ) {
        hasWarnedMismatch = true;
        // eslint-disable-next-line no-console
        console.warn(
          `ButtonGroup (segmented): measured ${measured.length} DOM children but received ${elementCount} element children. ` +
            "Each child should render exactly one element; per-row corner rounding may be misaligned.",
        );
      }

      const next: number[] = [];
      for (const [index, item] of measured.entries()) {
        const previous = measured[index - 1];
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
  }, [ref, shouldMeasure, elementCount]);

  if (variant !== "segmented") {
    return content;
  }

  // `rowBreaks` are indexed by DOM element (what the effect measures), so index
  // by element position too — counting text/whitespace children here would
  // shift every button's row role.
  const lastElementIndex = elementCount - 1;
  const rowAttrsByElement = new Map<
    React.ReactNode,
    { start: boolean; end: boolean }
  >();
  for (const [elementIndex, element] of elements.entries()) {
    rowAttrsByElement.set(element, {
      start: elementIndex === 0 || rowBreaks.includes(elementIndex),
      end:
        elementIndex === lastElementIndex ||
        rowBreaks.includes(elementIndex + 1),
    });
  }

  return items.map((child) => {
    const rowAttrs = rowAttrsByElement.get(child);
    if (!rowAttrs) {
      return child;
    }
    return cloneElement(child as React.ReactElement<Record<string, unknown>>, {
      "data-row-start": rowAttrs.start ? "" : undefined,
      "data-row-end": rowAttrs.end ? "" : undefined,
    });
  });
};
