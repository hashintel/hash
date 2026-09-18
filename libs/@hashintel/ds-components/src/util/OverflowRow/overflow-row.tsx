import {
  useTagsInput,
  type UseTagsInputReturn,
} from "@ark-ui/react/tags-input";
import { Fragment, useCallback, useId, useMemo, useRef, useState } from "react";

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
 *
 * The row can also be interactive: `withInput` appends an inline input that
 * submits new item names, and `withKeyboardControl` lets the arrow keys walk
 * a highlight across the items with Backspace/Delete removing the highlighted
 * one. Both only report intent (`onSubmit`/`onRemove`) — `items` stays owned
 * by the parent.
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
  /** How the content sits while the row underflows its container. Defaults
   * to "left". A `scroll` row that overflows re-anchors to the start so
   * every item stays reachable by scrolling. */
  align?: "left" | "right" | "center";
  /** Appends an inline text input for adding items. It claims only a minimum
   * width while items are fitted, then flexes into the space left over; in a
   * scrolling row (including the focus-expanded display) it instead grows
   * with the typed draft, scrolling the items aside, up to 80% of the row.
   * Enter submits the trimmed draft through `onSubmit` (and clears it) — the
   * parent decides whether an item is actually added. `value`/`onChange`
   * optionally control the draft text; `placeholder` shows while the draft
   * is empty. */
  withInput?: {
    value?: string;
    onChange?: (value: string) => void;
    onSubmit: (value: string) => void;
    placeholder?: string;
  };
  /** Lets the keyboard operate on the items. With focus in the row's input
   * (a zero-size focus anchor when `withInput` is off), ArrowLeft/ArrowRight
   * from the draft's start move a highlight across the items, and
   * Backspace/Delete remove the highlighted one by calling `onRemove` with
   * its `name`. So that every item is rendered and reachable, a `truncate`
   * or `summary` row displays as `scroll` while focus is inside it.
   *
   * The highlighted item's wrapper is marked with `data-highlighted` (DOM
   * focus stays on the input) and the item styles its own highlight from
   * that — Chip shows its focus ring automatically; custom items can match
   * on `[data-part='item-preview'][data-highlighted] &`. */
  withKeyboardControl?: {
    onRemove: (value: string) => void;
  };
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

const OverflowRowBase = ({
  className,
  items,
  overflow,
  separator,
  total,
  renderCountLabel,
  align,
  withInput,
  withKeyboardControl,
  tags,
  onFocusWithinChange,
}: OverflowRowProps & {
  tags?: UseTagsInputReturn;
  /** Reports focus entering/leaving the row, for the focus-expansion of
   * keyboard-controlled `truncate`/`summary` rows. */
  onFocusWithinChange?: (focusWithin: boolean) => void;
}) => {
  const gapless =
    separator !== undefined &&
    (typeof separator !== "string" || !collapsibleWhitespace.test(separator));
  const classes = styles({ overflow, gapless, align });
  const count = items.length;
  const hasSeparator = separator !== undefined;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const hasInput = withInput !== undefined;

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const rootStyle = getComputedStyle(root);
    // The input flexes into whatever remains, so only its min width is a hard
    // claim on the row; reserve it (plus the gap or margin beside it) before
    // fitting.
    const inputEl = inputRef.current;
    const inputStyle = inputEl ? getComputedStyle(inputEl) : undefined;
    const reserved =
      hasInput && inputStyle
        ? (Number.parseFloat(inputStyle.minWidth) || 0) +
          (Number.parseFloat(inputStyle.marginLeft) || 0) +
          (Number.parseFloat(rootStyle.columnGap) || 0)
        : 0;
    const available =
      root.clientWidth -
      (Number.parseFloat(rootStyle.paddingLeft) || 0) -
      (Number.parseFloat(rootStyle.paddingRight) || 0) -
      reserved;

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
  }, [overflow, count, hasInput]);

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

  // With keyboard control on, each visible cell carries the machine's item
  // parts so it can be highlighted; the measure-layer clones stay plain so
  // the machine's DOM queries never see them.
  const itemCell = (
    item: { name: string; children: React.ReactNode },
    index: number,
  ) => {
    if (tags && withKeyboardControl) {
      const itemProps = { index, value: item.name };
      return (
        <span {...tags.getItemProps(itemProps)} className={classes.item}>
          <span
            {...tags.getItemPreviewProps(itemProps)}
            className={classes.itemPreview}
          >
            {item.children}
          </span>
        </span>
      );
    }
    return <span className={classes.item}>{item.children}</span>;
  };

  // The machine anchors all keyboard handling on its input, so keyboard
  // control without `withInput` still renders one — as a zero-size focus
  // anchor. The placeholder is applied here rather than through the machine,
  // which would only show it while `items` is empty. The key keeps the input
  // element (and its focus) alive when focus-expansion swaps the mode branch.
  const inputCell = tags ? (
    withInput ? (
      <input
        {...tags.getInputProps()}
        key="input"
        ref={inputRef}
        className={classes.input}
        placeholder={withInput.placeholder}
      />
    ) : (
      <input
        {...tags.getInputProps()}
        key="input"
        readOnly
        data-ghost=""
        className={classes.inputGhost}
      />
    )
  ) : null;

  const focusProps =
    onFocusWithinChange === undefined
      ? undefined
      : {
          onFocus: () => onFocusWithinChange(true),
          onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
            const next = event.relatedTarget;
            if (
              !(next instanceof Node) ||
              !event.currentTarget.contains(next)
            ) {
              onFocusWithinChange(false);
            }
          },
        };

  if (overflow === "scroll") {
    return (
      <div
        {...tags?.getRootProps()}
        {...focusProps}
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
            {itemCell(item, index)}
          </Fragment>
        ))}
        {inputCell}
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
      <div
        {...tags?.getRootProps()}
        {...focusProps}
        ref={rootRef}
        className={cx(classes.root, className)}
      >
        <span key="summary" className={classes.summary}>
          {summaryLabel()}
        </span>
        {inputCell}
        <div
          key="measure"
          ref={measureRef}
          className={classes.measure}
          aria-hidden="true"
        >
          <span ref={namesCellRef}>{joinedNames}</span>
          <span ref={countCellRef}>{countLabel(countText)}</span>
        </div>
      </div>
    );
  }

  const shownCount = Math.min(fitCount, count);
  const hiddenCount = count - shownCount;

  return (
    <div
      {...tags?.getRootProps()}
      {...focusProps}
      ref={rootRef}
      className={cx(classes.root, className)}
    >
      {items.slice(0, shownCount).map((item, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <Fragment key={index}>
          {index > 0 ? rowSeparator : null}
          {itemCell(item, index)}
        </Fragment>
      ))}
      {hiddenCount > 0 ? (
        <Fragment key="plus">
          {shownCount > 0 ? rowSeparator : null}
          <span className={classes.plus}>{countLabel(`+${hiddenCount}`)}</span>
        </Fragment>
      ) : null}
      {inputCell}

      {/* Hidden measurement layer: the full row at natural width, plus the
          badge at its widest possible label. */}
      <div
        key="measure"
        ref={measureRef}
        className={classes.measure}
        aria-hidden="true"
      >
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

/** Mounts the Ark tags-input machine and hands its api to the base row. The
 * machine's value is controlled by `items`, so its adds and removes never
 * apply directly — they surface as `onSubmit`/`onRemove` intents instead. */
const InteractiveOverflowRow = (props: OverflowRowProps) => {
  const { items, overflow, withInput, withKeyboardControl } = props;
  const names = items.map((item) => item.name);

  // Keyboard control needs its items rendered, so a `truncate` or `summary`
  // row displays as `scroll` while focus is inside it.
  const [focusWithin, setFocusWithin] = useState(false);
  const expandOnFocus =
    withKeyboardControl !== undefined && overflow !== "scroll";
  const expanded = expandOnFocus && focusWithin;
  const displayedOverflow = expanded ? "scroll" : overflow;

  // The machine api exposes no highlight getter, so mirror it for the
  // expansion effect below.
  const highlightedIdRef = useRef<string | null>(null);
  const wasExpandedRef = useRef(false);
  const wasFocusWithinRef = useRef(false);

  // Self-assigned element ids: the scroll housekeeping below needs the root
  // and input elements in contexts where the machine api isn't at hand.
  const reactId = useId();
  const rootId = `overflow-row:${reactId}`;
  const inputId = `overflow-row:${reactId}:input`;

  const tags = useTagsInput({
    ids: { root: rootId, input: inputId },
    value: names,
    // Items are arbitrary nodes, never editable in place; duplicate
    // submissions still reach `onSubmit` for the parent to judge.
    editable: false,
    allowDuplicates: true,
    // Enter is the only submit key — a comma is just text.
    delimiter: "",
    inputValue: withInput?.value,
    onInputValueChange: (details) => {
      withInput?.onChange?.(details.inputValue);
      // The input grows with the draft in a scroll row, but the container
      // doesn't follow the caret on its own — keep the input in view.
      if (displayedOverflow !== "scroll") {
        return;
      }
      const input = document.getElementById(inputId);
      if (input && document.activeElement === input) {
        input.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
    onValueChange: (details) => {
      const next = details.value;
      if (next.length > names.length) {
        // The machine appends submissions to the end.
        const submitted = next[next.length - 1];
        if (submitted !== undefined) {
          withInput?.onSubmit(submitted);
        }
        return;
      }
      // A removal drops a single entry: the first index where the arrays
      // diverge names it.
      let index = 0;
      while (index < next.length && next[index] === names[index]) {
        index += 1;
      }
      const removed = names[index];
      if (removed !== undefined) {
        withKeyboardControl?.onRemove(removed);
      }
    },
    onHighlightChange: (details) => {
      highlightedIdRef.current = details.highlightedValue;
      if (displayedOverflow !== "scroll") {
        return;
      }
      // Keep the highlighted item in view while arrowing through a scroll row.
      if (details.highlightedValue !== null) {
        document
          .getElementById(details.highlightedValue)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      // Highlight cleared while focus stays on the input: navigation returned
      // to it (arrowing past the last item, Escape, typing) — the browser
      // won't scroll to an already-focused element, so bring it into view.
      // A blur clears the highlight too, but by then focus has moved on and
      // the focus-out effect resets the scroll instead.
      const input = document.getElementById(inputId);
      if (input && document.activeElement === input) {
        input.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
  });

  // On expansion: re-anchor focus on the input (in case the mode-branch swap
  // recreated it, whose blur would immediately collapse the row again), then
  // reveal the end of the row, where the input sits. When the focus came from
  // clicking an item, keep that item's highlight in view instead. When focus
  // leaves the row, scroll back to its start.
  useIsomorphicLayoutEffect(() => {
    const justExpanded = expanded && !wasExpandedRef.current;
    const justBlurred = !focusWithin && wasFocusWithinRef.current;
    wasExpandedRef.current = expanded;
    wasFocusWithinRef.current = focusWithin;
    if (!justExpanded && !justBlurred) {
      return;
    }
    const root = document.getElementById(rootId);
    if (justBlurred) {
      if (root) {
        root.scrollLeft = 0;
      }
      return;
    }
    tags.focus();
    const highlightedId = highlightedIdRef.current;
    if (highlightedId !== null) {
      document
        .getElementById(highlightedId)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    if (root) {
      root.scrollLeft = root.scrollWidth;
    }
  }, [expanded, focusWithin, rootId, tags]);

  if (!expanded) {
    return (
      <OverflowRowBase
        {...props}
        tags={tags}
        onFocusWithinChange={setFocusWithin}
      />
    );
  }
  // The summary-only props are dropped along with the summary display; the
  // parent's `overflow` still drives measurement once focus leaves.
  return (
    <OverflowRowBase
      {...props}
      overflow="scroll"
      total={undefined}
      renderCountLabel={undefined}
      tags={tags}
      onFocusWithinChange={setFocusWithin}
    />
  );
};

export const OverflowRow = ({
  withInput,
  withKeyboardControl,
  ...rest
}: OverflowRowProps) => {
  // The tags machine mounts live-region and focus-tracking effects — only
  // worth paying for when an interactive prop asks for it.
  if (withInput !== undefined || withKeyboardControl !== undefined) {
    return (
      <InteractiveOverflowRow
        {...rest}
        withInput={withInput}
        withKeyboardControl={withKeyboardControl}
      />
    );
  }
  return <OverflowRowBase {...rest} />;
};
