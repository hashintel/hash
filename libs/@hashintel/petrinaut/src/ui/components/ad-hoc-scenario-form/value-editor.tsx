/**
 * The editor every value slot opens, in place: the trigger is the cell, and
 * opening replaces it with a Monaco single-line editor at exactly the cell's
 * position — no chrome, no padding. The slot's attribution path (`Space ›
 * item 0 › x`) floats quietly above the cell; the Optimize control floats
 * below it, and turning Optimize on replaces the expression editor with a
 * small bounds spreadsheet in the same slot: labeled Min/Max/Scale cells
 * (Step where definable), each a square expression cell with the form's
 * selection model — focus selects, Enter edits in a frameless Monaco,
 * Enter or Escape returns to the cell. Toggling destroys nothing: the core
 * transition retains bounds and expression alike.
 *
 * A closed slot still shows its problems: the trigger underlines in red and
 * carries the first synthesis error or LSP diagnostic as its tooltip.
 */

import { Portal } from "@ark-ui/react/portal";
import {
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Select, usePortalContainerRef } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { adHocSlotKey, adHocTargetLabel } from "@hashintel/petrinaut-core";

import { CodeEditor } from "../../monaco/code-editor";
import { AdHocFormContext, adHocSelectionText } from "./form-context";
import {
  cellSelectStyle,
  dependencyHighlightStyle,
} from "./spreadsheet/form-table";
import { OptimizeToggle } from "./spreadsheet/optimize-toggle";

import type { AdHocValue, AdHocValueTarget } from "@hashintel/petrinaut-core";

const triggerStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  height: "[100%]",
  minHeight: "[28px]",
  border: "none",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s110",
  backgroundColor: "[transparent]",
  cursor: "pointer",
  textAlign: "left",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  _hover: { backgroundColor: "neutral.s10" },
  // Plain :focus, not :focus-visible: a pointer click selects the cell and
  // the selection must show either way.
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

const triggerTextStyle = css({
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

const optimizedTriggerStyle = css({
  backgroundColor: "purple.s10",
  color: "purple.s110",
  _hover: { backgroundColor: "purple.s20" },
});

const derivedTriggerStyle = css({
  opacity: "[0.55]",
});

const placeholderTriggerStyle = css({
  color: "neutral.s70",
});

const errorTriggerStyle = css({
  "& > span": {
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationColor: "red.s90",
    textUnderlineOffset: "[3px]",
  },
});

/** Only one editor may be open; opening one announces itself to the rest. */
const OPEN_EVENT = "petrinaut-adhoc-editor-open";

// The open editor sits exactly over the cell; the path floats above it and
// the Optimize control below, both quieter than the content. The overlay
// portals to the app-level container, so it must layer on the `popover`
// tier — the same layer the ds Popover uses — to paint above the bottom
// panel (`sticky` − 2) and the drawers (`modal`) the form is embedded in.
const overlayStyle = css({
  position: "fixed",
  zIndex: "popover",
});

const overlayBodyStyle = css({
  position: "relative",
  zIndex: "[1]",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[0 0 0 1px {colors.neutral.s110}, 0 4px 12px -4px rgba(0,0,0,0.25)]",
  display: "flex",
});

// The label bar and the Optimize bar sit flush against the editor, spanning
// its full width — one square slab, no gaps. Both are dark, so the slab's
// frame contrasts with the spreadsheet around it.
const pathLabelStyle = css({
  position: "absolute",
  bottom: "[100%]",
  left: "[0]",
  right: "[0]",
  animation: "[fadeIn 0.12s ease-out both]",
  paddingX: "1.5",
  paddingY: "[3px]",
  backgroundColor: "neutral.s110",
  // The same 1px ring as the editor body, so the bar and the cell share one
  // frame width; rounded only where it does not touch the cell.
  boxShadow: "[0 0 0 1px {colors.neutral.s110}]",
  borderTopLeftRadius: "[6px]",
  borderTopRightRadius: "[6px]",
  fontSize: "[9px]",
  fontFamily: "mono",
  color: "neutral.s30",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  pointerEvents: "none",
});

const belowStripStyle = css({
  position: "absolute",
  top: "[100%]",
  left: "[0]",
  right: "[0]",
  animation: "[fadeIn 0.12s ease-out both]",
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  paddingX: "1",
  paddingY: "[3px]",
  backgroundColor: "neutral.s110",
  boxShadow: "[0 0 0 1px {colors.neutral.s110}]",
  borderBottomLeftRadius: "[6px]",
  borderBottomRightRadius: "[6px]",
});

// The bounds are a small spreadsheet inside the slab: one labeled square
// column per field, hairline-delimited, no chrome of their own — the slab's
// path and Optimize bars stay the only header and footer.
const boundsGridStyle = css({
  display: "flex",
  width: "[100%]",
});

const boundsColumnStyle = css({
  flex: "1",
  minWidth: "[64px]",
  borderLeft: "[1px solid {colors.neutral.a05}]",
  _first: { borderLeft: "none" },
});

const boundsScaleColumnStyle = css({
  flex: "[0 0 96px]",
});

const boundsLabelStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[16px]",
  paddingX: "1.5",
  fontFamily: "mono",
  fontSize: "[9px]",
  fontWeight: "medium",
  color: "neutral.s80",
  backgroundColor: "neutral.s15",
  borderBottom: "[1px solid {colors.neutral.a05}]",
});

const boundTriggerStyle = css({
  display: "flex",
  alignItems: "center",
  width: "[100%]",
  height: "[28px]",
  border: "none",
  padding: "[4px 8px]",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s110",
  backgroundColor: "[transparent]",
  cursor: "pointer",
  textAlign: "left",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  _hover: { backgroundColor: "neutral.s10" },
  _focus: {
    outline: "[2px solid {colors.blue.s70}]",
    outlineOffset: "[-2px]",
    backgroundColor: "blue.s05",
  },
});

const boundEditorStyle = css({
  display: "flex",
  width: "[100%]",
  height: "[28px]",
});

const fieldErrorStyle = css({
  position: "absolute",
  top: "[100%]",
  right: "[0]",
  marginTop: "[3px]",
  maxWidth: "[100%]",
  fontSize: "[10px]",
  color: "red.s100",
  backgroundColor: "neutral.s00",
  paddingX: "1",
});

const booleanNoteStyle = css({
  display: "flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "2",
  fontSize: "[10px]",
  color: "purple.s110",
  whiteSpace: "nowrap",
});

const expressionRowStyle = css({
  display: "flex",
  width: "[100%]",
});

export interface ValueEditorProps {
  value: AdHocValue;
  /**
   * The slot's location. Edits dispatch against it — `setExpression`,
   * `setDomainField`, `toggleSelection` — and its attribution label, LSP
   * document, and error lookup all derive from it. A derived cell passes its
   * column's target, so the shared value's problems surface on every cell it
   * supersedes.
   */
  target: AdHocValueTarget;
  /** Integer slots validate integer bounds. */
  integer?: boolean;
  /** Boolean slots optimize as a true/false choice with no bounds. */
  booleanDomain?: boolean;
  /** Counts hide the Step field (integer step 1 is implied). */
  withStep?: boolean;
  /**
   * Rendered as derived: dimmed, chevron-prefixed, out of the tab order, and
   * editing is delegated to the shared column's own editor by the parent.
   */
  derived?: boolean;
  /** Extra classname for the trigger. */
  className?: string;
  /** Overrides the trigger content (defaults to the expression). */
  display?: React.ReactNode;
  /** Trigger placeholder when the expression is empty. */
  placeholder?: string;
  /**
   * Opens the editor when this becomes a fresh non-zero nonce (phantom-row
   * materialization, derived-cell click-through).
   */
  autoOpen?: number;
  onOpenDerived?: () => void;
  /** Registers the trigger for the owning table's keyboard navigation. */
  triggerRef?: (element: HTMLButtonElement | null) => void;
  /** Keyboard navigation hook; Enter/open behaviour stays internal. */
  onTriggerKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}

/** The minimum open-editor width; narrow cells grow to stay usable. */
const MIN_OVERLAY_WIDTH = 220;

/** The wider minimum when the bounds spreadsheet is showing. */
const MIN_BOUNDS_OVERLAY_WIDTH = 340;

interface BoundCellProps {
  /** The visible field label ("Min"); the accessible name appends the value's path. */
  label: string;
  valueLabel: string;
  bound: string;
  /** The bound slot's Monaco document, for type checking while editing. */
  uri: string | undefined;
  error: string | undefined;
  editing: boolean;
  onStartEdit: () => void;
  /** Enter in the expression editor: commit and return to the selected cell. */
  onEndEdit: () => void;
  onChange: (next: string) => void;
  registerTrigger: (element: HTMLButtonElement | null) => void;
  onNavigate: (delta: -1 | 1) => void;
  /** Reports the mounted Monaco instance to the slab's Escape handling. */
  onEditorMount: (
    editorInstance: Parameters<
      NonNullable<React.ComponentProps<typeof CodeEditor>["onMount"]>
    >[0],
  ) => void;
}

/**
 * One bound cell of the bounds spreadsheet, with the form's cell selection
 * model: focusing selects, Enter (or a second click) opens an in-place
 * expression editor, Enter or Escape leaves it. No chrome of its own.
 */
const BoundCell: React.FC<BoundCellProps> = ({
  label,
  valueLabel,
  bound,
  uri,
  error,
  editing,
  onStartEdit,
  onEndEdit,
  onChange,
  registerTrigger,
  onNavigate,
  onEditorMount,
}) => {
  const wasFocusedOnPointerDownRef = useRef(false);
  const selfRef = useRef<HTMLButtonElement | null>(null);

  if (editing) {
    return (
      <div className={boundEditorStyle}>
        <CodeEditor
          singleLine
          frameless
          language="typescript"
          path={uri}
          value={bound}
          onMount={(editorInstance) => {
            onEditorMount(editorInstance);
            editorInstance.focus();
          }}
          onChange={(next) => onChange(next ?? "")}
          onSubmit={onEndEdit}
        />
      </div>
    );
  }

  return (
    <button
      ref={(element) => {
        selfRef.current = element;
        registerTrigger(element);
      }}
      type="button"
      aria-label={`${label} of ${valueLabel}`}
      title={error}
      className={cx(boundTriggerStyle, error && errorTriggerStyle)}
      onPointerDown={() => {
        wasFocusedOnPointerDownRef.current =
          document.activeElement === selfRef.current;
      }}
      onClick={(event) => {
        // A keyboard "click" (Enter/Space) always edits; a pointer click
        // edits only an already-selected cell — the first click selects.
        if (event.detail === 0 || wasFocusedOnPointerDownRef.current) {
          onStartEdit();
        }
      }}
      onDoubleClick={onStartEdit}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          onNavigate(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <span>{bound}</span>
    </button>
  );
};

export const ValueEditor: React.FC<ValueEditorProps> = ({
  value,
  target,
  integer = false,
  booleanDomain = false,
  withStep = true,
  derived = false,
  className,
  display,
  placeholder = "0",
  autoOpen = 0,
  onOpenDerived,
  triggerRef,
  onTriggerKeyDown,
}) => {
  const {
    errorFor,
    uriFor,
    formState,
    synthesisContext,
    selection,
    highlight,
    setFocusedValue,
    dispatch,
  } = use(AdHocFormContext);
  const label = adHocTargetLabel(target, formState, synthesisContext);
  const dependencyHighlighted = highlight.slotKeys.has(
    adHocSlotKey({ target, part: "expression" }),
  );
  const portalContainerRef = usePortalContainerRef();
  const editorId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // The one Monaco instance open inside the slab (the expression editor or
  // one bound cell's), so Escape can dismiss its widgets without closing it.
  const monacoRef = useRef<
    | Parameters<
        NonNullable<React.ComponentProps<typeof CodeEditor>["onMount"]>
      >[0]
    | null
  >(null);
  // Whether the pointer landed on an already-selected cell: the first click
  // selects, the second (or a double-click, or Enter) edits.
  const wasFocusedOnPointerDownRef = useRef(false);
  const [open, setOpenState] = useState(autoOpen > 0);
  // Which bound cell holds an open expression editor. Escape peels one
  // layer: it leaves the bound edit first, and closes the slab from a
  // selected cell.
  const [editingBound, setEditingBound] = useState<
    "min" | "max" | "step" | null
  >(null);
  if (!open && editingBound !== null) {
    setEditingBound(null);
  }
  const boundRefs = useRef(new Map<string, HTMLButtonElement>());
  // Opening the slab selects the Min cell once; reset per open.
  const minAutoSelectedRef = useRef(false);

  // Opening announces itself so any other open editor yields. The dispatch
  // lives in an effect, never in render: the listeners call other
  // components' setState, and this also covers an editor that mounts
  // already open (a materialized phantom row's cell).
  useEffect(() => {
    if (open) {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: editorId }));
    }
  }, [open, editorId]);

  const endBoundEdit = (key: "min" | "max" | "step") => {
    setEditingBound(null);
    setTimeout(() => boundRefs.current.get(key)?.focus(), 0);
  };

  // ArrowUp/Down while the open editor holds a bare numeric literal steps it
  // like a spinner: ±1, ±10 with Shift. Captured on the overlay so it wins
  // over Monaco, but only when the suggest widget is closed and the editor
  // itself (expression or bound) has focus — setValue routes through the
  // editor's onChange, so the right dispatch fires either way.
  const stepNumericLiteral = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    const editorInstance = monacoRef.current;
    const model = editorInstance?.getModel();
    if (!editorInstance || !model || !editorInstance.hasTextFocus()) {
      return;
    }
    if (overlayRef.current?.querySelector(".suggest-widget.visible")) {
      return;
    }
    const current = model.getValue();
    if (!/^\s*-?(\d+(\.\d*)?|\.\d+)\s*$/.test(current)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const delta =
      (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
    const decimals = /\.(\d*)\s*$/.exec(current)?.[1]?.length ?? 0;
    const next = (Number.parseFloat(current) + delta).toFixed(decimals);
    editorInstance.setValue(next);
    editorInstance.setPosition({ lineNumber: 1, column: next.length + 1 });
  };
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // Render-adjusted state: a fresh auto-open nonce opens the editor without
  // an effect (materialized phantom rows, derived-cell click-through).
  const [seenAutoOpen, setSeenAutoOpen] = useState(autoOpen);
  if (autoOpen !== seenAutoOpen) {
    setSeenAutoOpen(autoOpen);
    if (autoOpen > 0) {
      setOpenState(true);
    }
  }

  const measure = () => {
    const element = buttonRef.current;
    if (!element) {
      return;
    }
    const bounds = element.getBoundingClientRect();
    setRect({
      top: bounds.top,
      left: bounds.left,
      width: bounds.width,
      height: bounds.height,
    });
  };

  useLayoutEffect(() => {
    if (open) {
      measure();
    }
  }, [open]);

  // The overlay tracks the cell through scrolling and resizes, closes on any
  // pointer press outside itself, and yields when another editor opens.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onAnotherEditorOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== editorId) {
        setOpenState(false);
      }
    };
    window.addEventListener(OPEN_EVENT, onAnotherEditorOpen);
    const onScrollOrResize = () => measure();
    const onPointerDown = (event: PointerEvent) => {
      const overlay = overlayRef.current;
      if (overlay && event.target instanceof Node) {
        if (
          !overlay.contains(event.target) &&
          !buttonRef.current?.contains(event.target)
        ) {
          setOpenState(false);
        }
      }
    };
    // Escape peels exactly one layer and never reaches the host: the form
    // may sit in a drawer/dialog whose own Escape handler listens at
    // document capture (Zag's dismissable), so this listener sits on
    // `window` capture — above document — and consumes the event before
    // the host can act on it.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const overlay = overlayRef.current;
      // Only an Escape from inside the slab (or its trigger cell) is the
      // slab's to consume — one aimed at another open layer (a gutter menu)
      // stays that layer's.
      if (
        !(event.target instanceof Node) ||
        !(
          overlay?.contains(event.target) ||
          buttonRef.current?.contains(event.target)
        )
      ) {
        return;
      }
      // An open Ark layer inside the slab (the Scale select) is above the
      // slab: its own dismissal handles this Escape.
      if (
        overlay?.querySelector('[data-part="trigger"][aria-expanded="true"]')
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      // Innermost first: a visible Monaco widget (suggestions, signature
      // help) closes without leaving the expression editor. Falls through
      // when no editor instance is registered — Escape must never be
      // swallowed with no effect.
      if (
        monacoRef.current &&
        overlay?.querySelector(
          ".suggest-widget.visible, .parameter-hints-widget.visible",
        )
      ) {
        monacoRef.current.trigger("keyboard", "hideSuggestWidget", {});
        monacoRef.current.trigger("keyboard", "closeParameterHints", {});
        return;
      }
      if (editingBound !== null) {
        const key = editingBound;
        setEditingBound(null);
        setTimeout(() => boundRefs.current.get(key)?.focus(), 0);
        return;
      }
      setOpenState(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    // The fixed overlay tracks the cell, but a cell scrolled out of its
    // clipped container must not leave the slab floating detached over
    // unrelated UI — close when the trigger stops being visible.
    const trigger = buttonRef.current;
    const visibility =
      trigger && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => !entry.isIntersecting)) {
                setOpenState(false);
              }
            },
            { threshold: 0.05 },
          )
        : null;
    if (trigger && visibility) {
      visibility.observe(trigger);
    }
    return () => {
      window.removeEventListener(OPEN_EVENT, onAnotherEditorOpen);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      visibility?.disconnect();
    };
  }, [open, editorId, editingBound]);

  // Value slots carry Optimize toggles only in optimize mode; expose mode
  // marks whole top-level Variables (in their own rows), never value slots.
  const selectable = selection === "optimize";
  const optimized = selectable && value.optimize !== null;
  const isEmpty = !display && !optimized && value.expression.trim() === "";
  const text =
    display ??
    (optimized
      ? booleanDomain
        ? "true / false"
        : `${value.optimize!.min} … ${value.optimize!.max}`
      : value.expression || placeholder);

  const expressionSlot = { target, part: "expression" as const };
  const error = optimized
    ? (errorFor({ target, part: "min" }) ??
      errorFor({ target, part: "max" }) ??
      errorFor({ target, part: "step" }))
    : errorFor(expressionSlot);
  const showTriggerError = error !== undefined && !open;

  const boundsError = optimized ? error : undefined;

  const boundFields: { key: "min" | "max" | "step"; fieldLabel: string }[] = [
    { key: "min", fieldLabel: "Min" },
    { key: "max", fieldLabel: "Max" },
    ...(integer && withStep
      ? [{ key: "step" as const, fieldLabel: "Step" }]
      : []),
  ];
  const boundOrder = [...boundFields.map((field) => field.key), "scale"];
  const navigateBound = (from: string, delta: -1 | 1) => {
    const next = boundOrder[boundOrder.indexOf(from) + delta];
    if (next) {
      boundRefs.current.get(next)?.focus();
    }
  };
  const registerBound =
    (key: string, selectOnAttach = false) =>
    (element: HTMLButtonElement | null) => {
      if (element) {
        boundRefs.current.set(key, element);
        if (selectOnAttach && !minAutoSelectedRef.current) {
          minAutoSelectedRef.current = true;
          element.focus();
        }
      } else {
        boundRefs.current.delete(key);
        if (selectOnAttach) {
          minAutoSelectedRef.current = false;
        }
      }
    };
  const boundValue = (key: "min" | "max" | "step"): string =>
    key === "step"
      ? (value.optimize?.step ?? "1")
      : (value.optimize?.[key] ?? "");

  return (
    <>
      <button
        ref={(element) => {
          buttonRef.current = element;
          triggerRef?.(element);
        }}
        type="button"
        aria-label={label}
        title={showTriggerError ? error : undefined}
        data-highlighted={dependencyHighlighted || undefined}
        className={cx(
          triggerStyle,
          optimized && optimizedTriggerStyle,
          derived && derivedTriggerStyle,
          isEmpty && placeholderTriggerStyle,
          showTriggerError && errorTriggerStyle,
          dependencyHighlighted && dependencyHighlightStyle,
          className,
        )}
        tabIndex={derived ? -1 : 0}
        onFocus={() => setFocusedValue(target)}
        onBlur={() => {
          if (!open) {
            setFocusedValue(null);
          }
        }}
        onPointerDown={() => {
          wasFocusedOnPointerDownRef.current =
            document.activeElement === buttonRef.current;
        }}
        onClick={(event) => {
          if (derived) {
            onOpenDerived?.();
            return;
          }
          // A keyboard "click" (Enter/Space) carries no pointer detail and
          // always opens; a pointer click opens only on an already-selected
          // cell — the first click selects it.
          if (event.detail === 0 || wasFocusedOnPointerDownRef.current) {
            setOpenState(true);
          }
        }}
        onDoubleClick={() => {
          if (!derived) {
            setOpenState(true);
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={triggerTextStyle}>
          {derived ? <>⌃ {text}</> : text}
        </span>
      </button>
      {open && rect ? (
        <Portal container={portalContainerRef}>
          <div
            ref={overlayRef}
            className={overlayStyle}
            onKeyDownCapture={stepNumericLiteral}
            style={{
              top: rect.top,
              left: rect.left,
              width: Math.max(
                rect.width,
                optimized && !booleanDomain
                  ? MIN_BOUNDS_OVERLAY_WIDTH
                  : MIN_OVERLAY_WIDTH,
              ),
              minHeight: rect.height,
            }}
          >
            <div className={pathLabelStyle}>{label}</div>
            <div className={overlayBodyStyle}>
              {optimized && booleanDomain ? (
                <div className={booleanNoteStyle}>
                  The optimizer tries true and false.
                </div>
              ) : optimized ? (
                <div className={boundsGridStyle}>
                  {boundFields.map((field, fieldIndex) => (
                    <div key={field.key} className={boundsColumnStyle}>
                      <div className={boundsLabelStyle}>{field.fieldLabel}</div>
                      <BoundCell
                        label={field.fieldLabel}
                        valueLabel={label}
                        bound={boundValue(field.key)}
                        uri={uriFor({ target, part: field.key }) || undefined}
                        error={errorFor({ target, part: field.key })}
                        editing={editingBound === field.key}
                        onStartEdit={() => setEditingBound(field.key)}
                        onEndEdit={() => endBoundEdit(field.key)}
                        onChange={(next) =>
                          dispatch({
                            type: "setDomainField",
                            target,
                            field: field.key,
                            value: next,
                          })
                        }
                        registerTrigger={registerBound(
                          field.key,
                          fieldIndex === 0,
                        )}
                        onNavigate={(delta) => navigateBound(field.key, delta)}
                        onEditorMount={(editorInstance) => {
                          monacoRef.current = editorInstance;
                        }}
                      />
                    </div>
                  ))}
                  <div
                    ref={(element) => {
                      const trigger =
                        element?.querySelector<HTMLButtonElement>(
                          "[data-part='trigger']",
                        ) ?? null;
                      if (trigger) {
                        boundRefs.current.set("scale", trigger);
                      } else {
                        boundRefs.current.delete("scale");
                      }
                    }}
                    className={cx(
                      boundsColumnStyle,
                      boundsScaleColumnStyle,
                      cellSelectStyle,
                    )}
                    onKeyDownCapture={(event) => {
                      const trigger = event.currentTarget.querySelector(
                        "[data-part='trigger']",
                      );
                      if (trigger?.getAttribute("aria-expanded") === "true") {
                        return;
                      }
                      if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        event.stopPropagation();
                        navigateBound("scale", -1);
                      }
                    }}
                  >
                    <div className={boundsLabelStyle}>Scale</div>
                    <Select
                      required
                      size="sm"
                      aria-label={`Scale of ${label}`}
                      value={value.optimize!.scale}
                      onChange={(scale) =>
                        dispatch({
                          type: "setDomainField",
                          target,
                          field: "scale",
                          value: scale,
                        })
                      }
                      items={[
                        { value: "linear", text: "Linear" },
                        { value: "log", text: "Log" },
                      ]}
                    />
                  </div>
                </div>
              ) : (
                <div className={expressionRowStyle}>
                  <CodeEditor
                    singleLine
                    frameless
                    language="typescript"
                    path={uriFor(expressionSlot) || undefined}
                    value={value.expression}
                    placeholder={placeholder}
                    onMount={(editorInstance) => {
                      monacoRef.current = editorInstance;
                      editorInstance.focus();
                    }}
                    onChange={(expression) =>
                      dispatch({
                        type: "setExpression",
                        target,
                        expression: expression ?? "",
                      })
                    }
                    onSubmit={() => {
                      setOpenState(false);
                      buttonRef.current?.focus();
                    }}
                  />
                </div>
              )}
            </div>
            {selectable ? (
              <div className={belowStripStyle}>
                <OptimizeToggle
                  text={adHocSelectionText(selection)}
                  label={`${adHocSelectionText(selection)} ${label}`}
                  value={value.optimize !== null}
                  onChange={(on) =>
                    dispatch({ type: "toggleSelection", target, on })
                  }
                />
              </div>
            ) : null}
            {boundsError ? (
              <div className={fieldErrorStyle}>{boundsError}</div>
            ) : null}
          </div>
        </Portal>
      ) : null}
    </>
  );
};
