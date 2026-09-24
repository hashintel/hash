import {
  useTagsInput,
  type UseTagsInputProps,
  type UseTagsInputReturn,
} from "@ark-ui/react/tags-input";
import { Fragment, useCallback, useId, useMemo, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { useIsomorphicLayoutEffect } from "../use-isomorphic-layout-effect";
import { styles } from "./overflow-row.recipe";

import type { ExclusifyUnion } from "type-fest";

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
  /** Appends an inline text input for adding items. */
  withInput?: {
    value?: string;
    onChange?: (value: string) => void;
    onSubmit: (value: string) => void;
    placeholder?: string;
  };
  /** Lets the keyboard operate on the items. Left/Right move through the items
   * and backspace calls onRemove for that item. Pointer highlighting follows
   * focus: the press that gives a blurred row focus only focuses the input
   * (scrolled into view) — highlighting an item takes a press from within an
   * already-focused row. */
  withKeyboardControl?: {
    onRemove: (value: string) => void;
  };
  /** Overrides the id of the input rendered by `withInput` — the hook for a
   * composite widget whose own machine finds its input element by id, so
   * both machines share the one element (see the multiple Combobox). */
  inputId?: string;
  /**
   * Extra props merged onto the `withInput` input — the hook for wiring it
   * up as part of a composite ark-ui widget. Defined attributes override the
   * row's own and event handlers run before the row's — except `onKeyDown`,
   * which REPLACES the row's keydown handling: it receives the row's own
   * handler as its second argument, and the host decides whether (and with
   * what event) to run it — skip it for keys another machine consumed, or
   * pass a modified event where the machines' key handling disagrees.
   * `value`/`defaultValue` are ignored.
   */
  inputElementProps?: Omit<
    React.ComponentPropsWithoutRef<"input">,
    "onKeyDown"
  > & {
    onKeyDown?: (
      event: React.KeyboardEvent<HTMLInputElement>,
      machineOnKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void,
    ) => void;
  };
  /** Forwarded to the row's machine as its `onInteractOutside`: a composite
   * host `preventDefault`s for interactions with its own outside-rendered
   * parts (e.g. a combobox's portaled dropdown), which would otherwise blur
   * the machine and stall its keyboard control mid-session. */
  onInputInteractOutside?: UseTagsInputProps["onInteractOutside"];
} & ExclusifyUnion<
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
  | { overflow: "truncate"; renderCountLabel?: CountLabelRenderer }
  | { overflow: "scroll" }
>;

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
  inputElementProps,
  tags,
  focusWithin,
  onFocusWithinChange,
  maskInputDraft,
  scrollerId,
}: OverflowRowProps & {
  tags?: UseTagsInputReturn;
  focusWithin?: boolean;
  onFocusWithinChange?: (focusWithin: boolean) => void;
  maskInputDraft?: boolean;
  /** Lets the interactive wrapper reach the scroll container (nested inside
   * the machine's root) for its scroll housekeeping. */
  scrollerId?: string;
}) => {
  const gapless =
    separator !== undefined &&
    (typeof separator !== "string" || !collapsibleWhitespace.test(separator));
  const classes = styles({
    overflow,
    gapless,
    align,
    ringRoom: withKeyboardControl !== undefined,
  });
  const count = items.length;
  const hasSeparator = separator !== undefined;

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backspaceHoldBeganWithTextRef = useRef(false);
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
    const scroller = scrollerRef.current;
    if (!scroller) {
      return;
    }
    setClipStart(scroller.scrollLeft > 1);
    setClipEnd(
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
    );
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
      const previewProps = tags.getItemPreviewProps(itemProps);
      // The highlighted wrapper delegates focus-visibility to the item it
      // wraps (DOM focus stays on the row's input): the marker makes the
      // preset's `_focusVisible` condition fire for the subtree, so items
      // show their native focus styles without knowing about this row.
      const highlighted =
        (previewProps as Record<string, unknown>)["data-highlighted"] !==
        undefined;
      return (
        <span {...tags.getItemProps(itemProps)} className={classes.item}>
          <span
            {...previewProps}
            data-force-focus-visible={highlighted ? "" : undefined}
            className={classes.itemPreview}
            onPointerDown={(event) => {
              // The press that gives the row focus only enters the field:
              // it focuses the input (revealed at the row's end) rather
              // than highlighting the pressed item. Highlighting takes a
              // press from within an already-focused row.
              if (!focusWithin) {
                event.preventDefault();
                tags.focus();
                inputRef.current?.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
                return;
              }
              previewProps.onPointerDown?.(event);
            }}
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
  // anchor.
  const machineInputProps = tags && withInput ? tags.getInputProps() : null;
  const {
    value: _extraValue,
    defaultValue: _extraDefaultValue,
    onChange: extraOnChange,
    onInput: extraOnInput,
    onClick: extraOnClick,
    onPointerDown: extraOnPointerDown,
    onFocus: extraOnFocus,
    onBlur: extraOnBlur,
    onKeyDown: extraOnKeyDown,
    ...extraInputAttrs
  } = inputElementProps ?? {};
  // Undefined entries must not override the machine's attributes when spread
  const definedExtraInputAttrs = Object.fromEntries(
    Object.entries(extraInputAttrs).filter(([, attr]) => attr !== undefined),
  ) as typeof extraInputAttrs;
  // A press on the input dismisses a lingering item highlight (typing or
  // navigation would otherwise be needed): the machine exposes no clear
  // method and its own pointerdown reset only runs from idle, so this
  // replays its Escape exit path — navigation returns to the input, whose
  // entry clears the highlight. The fabricated event's preventDefault is
  // isolated so the real pointer event keeps its defaults, and it goes to
  // the row's machine only, never a composite host's.
  const clearItemHighlightOnPress = (input: HTMLInputElement) => {
    const highlighted = rootRef.current?.querySelector(
      "[data-part='item-preview'][data-highlighted]",
    );
    if (!highlighted) {
      return;
    }
    machineInputProps?.onKeyDown?.({
      key: "Escape",
      currentTarget: input,
      defaultPrevented: false,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>);
  };

  // The row's own keydown handling, handed to a host's `onKeyDown` as its
  // continuation. The hold-Backspace guard stays inside it so a host cannot
  // accidentally bypass it.
  const machineKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      if (!event.repeat) {
        backspaceHoldBeganWithTextRef.current =
          event.currentTarget.value !== "";
      } else if (
        backspaceHoldBeganWithTextRef.current &&
        event.currentTarget.value === ""
      ) {
        return;
      }
    }
    machineInputProps?.onKeyDown?.(event);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (extraOnKeyDown) {
      // The host owns the keydown flow: running the row's handling — and
      // with what event — is its call.
      extraOnKeyDown(event, machineKeyDown);
      return;
    }
    machineKeyDown(event);
  };

  // The machine treats the input as uncontrolled and writes its draft into
  // the DOM imperatively, so the mask works the same way.
  const wasDraftMaskedRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    const masked = maskInputDraft ?? false;
    const maskChanged = wasDraftMaskedRef.current !== masked;
    wasDraftMaskedRef.current = masked;
    const input = inputRef.current;
    if (!input || !tags) {
      return;
    }
    if (maskChanged) {
      input.value = masked ? "" : tags.inputValue;
    } else if (masked && input.value !== "") {
      // The machine re-synced the draft into the DOM (a controlled
      // `withInput.value` change while blurred) — re-assert the mask.
      input.value = "";
    }
  });

  const inputCell = tags ? (
    machineInputProps ? (
      <input
        {...machineInputProps}
        {...definedExtraInputAttrs}
        key="input"
        ref={inputRef}
        className={classes.input}
        placeholder={withInput?.placeholder}
        onInput={(event) => {
          extraOnInput?.(event);
          machineInputProps.onInput?.(event);
        }}
        onChange={(event) => {
          extraOnChange?.(event);
          machineInputProps.onChange?.(event);
        }}
        onClick={(event) => {
          extraOnClick?.(event);
          machineInputProps.onClick?.(event);
        }}
        onPointerDown={(event) => {
          extraOnPointerDown?.(event);
          machineInputProps.onPointerDown?.(event);
          clearItemHighlightOnPress(event.currentTarget);
        }}
        onFocus={(event) => {
          extraOnFocus?.(event);
          machineInputProps.onFocus?.(event);
        }}
        onBlur={(event) => {
          extraOnBlur?.(event);
          machineInputProps.onBlur?.(event);
        }}
        onKeyDown={handleInputKeyDown}
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
      >
        <div
          ref={scrollerRef}
          id={scrollerId}
          className={classes.scroller}
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
  const {
    items,
    overflow,
    withInput,
    withKeyboardControl,
    inputId: inputIdProp,
    onInputInteractOutside,
  } = props;
  const names = items.map((item) => item.name);

  // Keyboard control needs its items rendered, so a `truncate` or `summary`
  // row displays as `scroll` while focus is inside it.
  const [focusWithin, setFocusWithin] = useState(false);
  const expandOnFocus =
    withKeyboardControl !== undefined && overflow !== "scroll";
  const expanded = expandOnFocus && focusWithin;
  const displayedOverflow = expanded ? "scroll" : overflow;

  const maskInputDraft =
    !focusWithin && overflow !== "scroll" && withInput !== undefined;

  // The machine api exposes no highlight getter, so mirror it for the
  // expansion effect below.
  const highlightedIdRef = useRef<string | null>(null);
  const wasExpandedRef = useRef(false);
  const wasFocusWithinRef = useRef(false);

  // Self-assigned element ids: the scroll housekeeping below needs the
  // scroller and input elements in contexts where the machine api isn't at
  // hand. The scroller (the scroll container nested inside the machine's
  // root) gets its own, machine-independent id. A host-supplied `inputId`
  // takes over the input's id so an outer machine can find the same element.
  const reactId = useId();
  const rootId = `overflow-row:${reactId}`;
  const inputId = inputIdProp ?? `overflow-row:${reactId}:input`;
  const scrollerId = `overflow-row:${reactId}:scroller`;

  const tags = useTagsInput({
    ids: { root: rootId, input: inputId },
    value: names,
    // Items are arbitrary nodes, never editable in place; duplicate
    // submissions still reach `onSubmit` for the parent to judge.
    editable: false,
    allowDuplicates: true,
    // Enter is the only submit key — a comma is just text.
    delimiter: "",
    onInteractOutside: onInputInteractOutside,
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
      // the focus-out effect resets the scroll instead. The ghost anchor sits
      // out of layout at the scroll origin, so without a visible input there
      // is nothing to reveal — the row stays where it is.
      if (withInput === undefined) {
        return;
      }
      const input = document.getElementById(inputId);
      if (input && document.activeElement === input) {
        input.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    },
  });

  // On expansion: re-anchor focus on the input (in case the mode-branch swap
  // recreated it, whose blur would immediately collapse the row again), then
  // reveal the end of the row, where the input sits — with no visible input
  // there is nothing there to reveal, so the row stays at its start. When the
  // focus came from clicking an item, keep that item's highlight in view
  // instead. When focus leaves the row, scroll back to its start.
  useIsomorphicLayoutEffect(() => {
    const justExpanded = expanded && !wasExpandedRef.current;
    const justBlurred = !focusWithin && wasFocusWithinRef.current;
    wasExpandedRef.current = expanded;
    wasFocusWithinRef.current = focusWithin;
    if (!justExpanded && !justBlurred) {
      return;
    }
    // Absent when the row has collapsed back to truncate/summary, whose next
    // expansion mounts a fresh scroller at its start anyway.
    const scroller = document.getElementById(scrollerId);
    if (justBlurred) {
      if (scroller) {
        scroller.scrollLeft = 0;
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
    if (scroller && withInput !== undefined) {
      scroller.scrollLeft = scroller.scrollWidth;
    }
  }, [expanded, focusWithin, scrollerId, tags, withInput]);

  if (!expanded) {
    return (
      <OverflowRowBase
        {...props}
        tags={tags}
        focusWithin={focusWithin}
        onFocusWithinChange={setFocusWithin}
        maskInputDraft={maskInputDraft}
        scrollerId={scrollerId}
      />
    );
  }
  // The summary-only props are dropped along with the summary display, and so
  // is the separator: it belongs to the display presentation (prose like
  // "A, B, C"), while the expanded row is an editing view whose gap-spaced
  // items need no joining. The parent's `overflow` still drives measurement
  // once focus leaves.
  return (
    <OverflowRowBase
      {...props}
      overflow="scroll"
      separator={undefined}
      total={undefined}
      renderCountLabel={undefined}
      tags={tags}
      focusWithin={focusWithin}
      onFocusWithinChange={setFocusWithin}
      maskInputDraft={maskInputDraft}
      scrollerId={scrollerId}
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
