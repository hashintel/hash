import { Fragment, useCallback, useMemo, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { useIsomorphicLayoutEffect } from "../use-isomorphic-layout-effect";
import { styles } from "./overflow-row.recipe";

/** Renders the count-derived labels the row generates — `truncate`'s "+X"
 * badge and `summary`'s synthetic texts ("none", "any", "X of Y") — as a
 * custom node. They render as plain text when this is omitted. */
type CountLabelRenderer = (text: string) => React.ReactNode;

/**
 * A single row of labelled items that adapts to the horizontal space
 * available, in one of three modes:
 *
 * - `summary` — plain text built from the item names: "none" when `items` is
 *   empty, "any" when every selectable item is selected (see `total`), the
 *   lone name when there is one item (switching to "1 of Y" once the name is
 *   heavily clipped and the count label meaningfully shorter), all names
 *   joined with `separator` while they fit, and "X of Y" (selected count of
 *   `total`) once they no longer do.
 * - `truncate` — each item's `children` in order, `separator` between them,
 *   stopping once the next item would no longer fit alongside a "+X" badge
 *   counting the hidden rest.
 * - `scroll` — every item's `children` (`separator` between them), scrolling
 *   horizontally.
 *
 * Fit is measured against the container width via a hidden layer rendering the
 * full row at natural width, re-measured on resize and font load.
 */
export type OverflowRowProps = {
  className?: string;
  /** The selected items. `name` is the plain-text label the `summary` mode is
   * built from; `children` is the node rendered per item by `truncate` and
   * `scroll`. */
  items: Array<{ name: string; children: React.ReactNode }>;
  /** Rendered between items: `summary` joins the names with it, while
   * `truncate` and `scroll` place it between item cells (and before the "+X"
   * badge). Defaults to " " — which the rows, being gap-spaced already, skip
   * rendering as an element. A separator that is undefined or collapsible
   * whitespace only leaves the cells spaced by the row gap; anything else
   * supplies the spacing itself and the gap is dropped. */
  separator?: React.ReactNode;
} & (
  | {
      overflow: "summary";
      renderCountLabel?: CountLabelRenderer;
      /** The total number of items that can be selected, of which `items` is
       * the selected subset — the Y in the "X of Y" summary. Once `items`
       * covers every selectable one, `summary` renders "any". Omit while the
       * total is not yet known (options still loading): the summary then
       * never claims full coverage and counts as "X selected" instead. */
      total?: number;
    }
  | {
      overflow: "truncate";
      renderCountLabel?: CountLabelRenderer;
      total?: never;
    }
  | { overflow: "scroll"; renderCountLabel?: never; total?: never }
);

// Whitespace HTML collapses (NBSP, which it doesn't, is deliberately absent).
const collapsibleWhitespace = /^[\t\n\f\r ]*$/;

export const OverflowRow = ({
  className,
  items,
  overflow,
  separator,
  total,
  renderCountLabel,
}: OverflowRowProps) => {
  const gapless =
    separator !== undefined &&
    (typeof separator !== "string" || !collapsibleWhitespace.test(separator));
  const classes = styles({ overflow, gapless });
  const count = items.length;
  const hasSeparator = separator !== undefined;

  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const separatorCellRef = useRef<HTMLSpanElement | null>(null);
  const plusCellRef = useRef<HTMLSpanElement | null>(null);
  const namesCellRef = useRef<HTMLSpanElement | null>(null);
  const countCellRef = useRef<HTMLSpanElement | null>(null);

  // Measured results — optimistic (everything shown) until the layout effect
  // corrects them before paint.
  const [fitCount, setFitCount] = useState(count);
  const [showCountLabel, setShowCountLabel] = useState(false);
  // Whether the `scroll` row clips items at either edge.
  const [clipStart, setClipStart] = useState(false);
  const [clipEnd, setClipEnd] = useState(false);

  // Value-equal re-measure key for the effect; `joinedNames` itself is a node
  // list with fresh identity per render.
  const namesKey = useMemo(
    () => items.map((item) => item.name).join("\0"),
    [items],
  );

  const joinedNames = useMemo(
    () =>
      items.flatMap((item, index) =>
        index === 0
          ? [item.name]
          : [
              // eslint-disable-next-line react/no-array-index-key
              <Fragment key={`separator-${index}`}>
                {separator ?? " "}
              </Fragment>,
              item.name,
            ],
      ),
    [items, separator],
  );

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rootStyle = getComputedStyle(root);
    const available =
      root.clientWidth -
      (Number.parseFloat(rootStyle.paddingLeft) || 0) -
      (Number.parseFloat(rootStyle.paddingRight) || 0);

    if (overflow === "summary") {
      const namesCell = namesCellRef.current;
      const countCell = countCellRef.current;
      if (!namesCell || !countCell || count === 0) {
        return;
      }
      const namesWidth = namesCell.getBoundingClientRect().width;
      if (count > 1) {
        setShowCountLabel(namesWidth > available);
        return;
      }
      // A lone name that no longer fits keeps rendering (ellipsified) unless
      // the clipping is substantial and "1 of X" buys real space: the
      // container under 90% of the name's width, the count label under 80%.
      const countLabelWidth = countCell.getBoundingClientRect().width;
      setShowCountLabel(
        available < namesWidth * 0.9 && countLabelWidth < namesWidth * 0.8,
      );
      return;
    }

    const measureLayer = measureRef.current;
    const plusCell = plusCellRef.current;
    if (overflow !== "truncate" || !measureLayer || !plusCell || count === 0) {
      return;
    }

    // Cumulative widths: each item cell's right edge relative to the layer
    // start already includes every gap and separator before it.
    const layerLeft = measureLayer.getBoundingClientRect().left;
    const cellEnds: number[] = [];
    for (let index = 0; index < count; index++) {
      const cell = cellRefs.current[index];
      if (!cell) {
        return;
      }
      cellEnds.push(cell.getBoundingClientRect().right - layerLeft);
    }

    if (cellEnds[count - 1]! <= available) {
      setFitCount(count);
      return;
    }

    // Not everything fits, so room for the "+X" badge — and the separator
    // before it — is reserved while items are admitted. Capped at count - 1:
    // the badge counts at least one item.
    const gap =
      Number.parseFloat(getComputedStyle(measureLayer).columnGap) || 0;
    const separatorCell = separatorCellRef.current;
    const badgeWidth =
      plusCell.getBoundingClientRect().width +
      (separatorCell ? separatorCell.getBoundingClientRect().width + gap : 0);
    let shown = 0;
    while (
      shown < count - 1 &&
      cellEnds[shown]! + gap + badgeWidth <= available
    ) {
      shown += 1;
    }
    setFitCount(shown);
  }, [overflow, count]);

  const updateClip = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    setClipStart(root.scrollLeft > 1);
    setClipEnd(root.scrollLeft + root.clientWidth < root.scrollWidth - 1);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const update = overflow === "scroll" ? updateClip : measure;
    update();

    // Late web-font loads reflow the text after the first update, so a
    // root-only observer would miss it and leave a stale result — observe both.
    if (typeof document !== "undefined" && document.fonts.status !== "loaded") {
      void document.fonts.ready.then(update);
    }

    if (typeof ResizeObserver === "undefined") {
      return undefined;
    }
    const observer = new ResizeObserver(() => update());
    if (rootRef.current) {
      observer.observe(rootRef.current);
    }
    if (measureRef.current) {
      observer.observe(measureRef.current);
    }
    return () => observer.disconnect();
  }, [overflow, measure, updateClip, namesKey, hasSeparator]);

  const rowSeparator = hasSeparator ? (
    <span className={classes.separator}>{separator}</span>
  ) : null;

  const countLabel = (text: string): React.ReactNode =>
    renderCountLabel ? renderCountLabel(text) : text;

  if (overflow === "scroll") {
    return (
      <div
        ref={rootRef}
        className={cx(classes.root, className)}
        data-clip-start={clipStart || undefined}
        data-clip-end={clipEnd || undefined}
        onScroll={updateClip}
      >
        {items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Fragment key={index}>
            {index > 0 ? rowSeparator : null}
            <span className={classes.item}>{item.children}</span>
          </Fragment>
        ))}
      </div>
    );
  }

  if (overflow === "summary") {
    const countText =
      total === undefined ? `${count} selected` : `${count} of ${total}`;
    const summaryLabel = () => {
      if (count === 0) {
        return countLabel("none");
      }
      if (total !== undefined && count >= total) {
        return countLabel("any");
      }
      return showCountLabel ? countLabel(countText) : joinedNames;
    };

    return (
      <div ref={rootRef} className={cx(classes.root, className)}>
        <span className={classes.summary}>{summaryLabel()}</span>
        <div ref={measureRef} className={classes.measure} aria-hidden="true">
          <span ref={namesCellRef}>{joinedNames}</span>
          <span ref={countCellRef}>{countLabel(countText)}</span>
        </div>
      </div>
    );
  }

  const shownCount = Math.min(fitCount, count);
  const hiddenCount = count - shownCount;

  return (
    <div ref={rootRef} className={cx(classes.root, className)}>
      {items.slice(0, shownCount).map((item, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {index > 0 ? rowSeparator : null}
          <span className={classes.item}>{item.children}</span>
        </Fragment>
      ))}
      {hiddenCount > 0 ? (
        <>
          {shownCount > 0 ? rowSeparator : null}
          <span className={classes.plus}>{countLabel(`+${hiddenCount}`)}</span>
        </>
      ) : null}

      {/* Hidden measurement layer: the full row at natural width, plus the
          badge at its widest possible label. */}
      <div ref={measureRef} className={classes.measure} aria-hidden="true">
        {items.map((item, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Fragment key={index}>
            {index > 0 && hasSeparator ? (
              <span
                ref={index === 1 ? separatorCellRef : undefined}
                className={classes.separator}
              >
                {separator}
              </span>
            ) : null}
            <span
              ref={(element) => {
                cellRefs.current[index] = element;
              }}
              className={classes.item}
            >
              {item.children}
            </span>
          </Fragment>
        ))}
        <span ref={plusCellRef} className={classes.plus}>
          {countLabel(`+${count}`)}
        </span>
      </div>
    </div>
  );
};
