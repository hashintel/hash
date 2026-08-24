/**
 * The editor every value slot opens, in place: the trigger is the cell, and
 * opening replaces it with a Monaco single-line editor at exactly the cell's
 * position — no chrome, no padding. The slot's attribution path (`Space ›
 * item 0 › x`) floats quietly above the cell; the Optimize control floats
 * below it, and turning Optimize on replaces the expression editor with
 * Min/Max/Scale (Step where definable) in the same slot. Toggling destroys
 * nothing: the core transition retains bounds and expression alike.
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

import {
  Select,
  TextInput,
  usePortalContainerRef,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  AD_HOC_DEFAULT_COUNT_OPTIMIZE,
  AD_HOC_DEFAULT_OPTIMIZE,
  adHocSlotKey,
  adHocTargetLabel,
  toggleAdHocOptimize,
} from "@hashintel/petrinaut-core";

import { CodeEditor } from "../../monaco/code-editor";
import { AdHocFormContext } from "./form-context";
import { dependencyHighlightStyle } from "./form-table";
import { OptimizeToggle } from "./optimize-toggle";

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
// the Optimize control below, both quieter than the content.
const overlayStyle = css({
  position: "fixed",
  zIndex: "[1000]",
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
});

const boundsRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "[2px]",
  width: "[100%]",
});

const boundFieldStyle = css({
  flex: "1",
  minWidth: "[56px]",
});

const scaleFieldStyle = css({
  flex: "[0 0 84px]",
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
  onChange: (value: AdHocValue) => void;
  /**
   * The slot's location: its attribution label, LSP document, and error
   * lookup all derive from it. A derived cell passes its column's target, so
   * the shared value's problems surface on every cell it supersedes.
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
  /** Overrides the trigger text (defaults to the expression). */
  display?: string;
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

export const ValueEditor: React.FC<ValueEditorProps> = ({
  value,
  onChange,
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
    optimizable,
    highlight,
    setFocusedValue,
  } = use(AdHocFormContext);
  const label = adHocTargetLabel(target, formState, synthesisContext);
  const dependencyHighlighted = highlight.slotKeys.has(
    adHocSlotKey({ target, part: "expression" }),
  );
  const portalContainerRef = usePortalContainerRef();
  const editorId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  // Whether the pointer landed on an already-selected cell: the first click
  // selects, the second (or a double-click, or Enter) edits.
  const wasFocusedOnPointerDownRef = useRef(false);
  const [open, setOpenState] = useState(autoOpen > 0);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next) {
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: editorId }));
    }
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
      setOpen(true);
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenState(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener(OPEN_EVENT, onAnotherEditorOpen);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, editorId]);

  const optimized = optimizable && value.optimize !== null;
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

  const boundField = (
    fieldLabel: string,
    fieldValue: string,
    setBound: (next: string) => void,
    focusOnOpen = false,
  ) => (
    <div className={boundFieldStyle}>
      <TextInput
        size="sm"
        aria-label={`${fieldLabel} of ${label}`}
        placeholder={fieldLabel}
        value={fieldValue}
        onChange={setBound}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- opening the editor is an explicit edit intent
        autoFocus={focusOnOpen}
      />
    </div>
  );

  const boundsError = optimized ? error : undefined;

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
            setOpen(true);
          }
        }}
        onDoubleClick={() => {
          if (!derived) {
            setOpen(true);
          }
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={triggerTextStyle}>{derived ? `⌃ ${text}` : text}</span>
      </button>
      {open && rect ? (
        <Portal container={portalContainerRef}>
          <div
            ref={overlayRef}
            className={overlayStyle}
            style={{
              top: rect.top,
              left: rect.left,
              width: Math.max(rect.width, MIN_OVERLAY_WIDTH),
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
                <div className={boundsRowStyle}>
                  {boundField(
                    "Min",
                    value.optimize!.min,
                    (min) =>
                      onChange({
                        ...value,
                        optimize: { ...value.optimize!, min },
                      }),
                    true,
                  )}
                  {boundField("Max", value.optimize!.max, (max) =>
                    onChange({
                      ...value,
                      optimize: { ...value.optimize!, max },
                    }),
                  )}
                  {integer && withStep
                    ? boundField("Step", value.optimize!.step ?? "1", (step) =>
                        onChange({
                          ...value,
                          optimize: { ...value.optimize!, step },
                        }),
                      )
                    : null}
                  <div className={scaleFieldStyle}>
                    <Select
                      size="sm"
                      aria-label={`Scale of ${label}`}
                      value={value.optimize!.scale}
                      onChange={(scale) =>
                        onChange({
                          ...value,
                          optimize: {
                            ...value.optimize!,
                            scale: scale === "log" ? "log" : "linear",
                          },
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
                      editorInstance.focus();
                    }}
                    onChange={(expression) =>
                      onChange({ ...value, expression: expression ?? "" })
                    }
                    onSubmit={() => {
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                  />
                </div>
              )}
            </div>
            {optimizable ? (
              <div className={belowStripStyle}>
                <OptimizeToggle
                  label={`Optimize ${label}`}
                  value={value.optimize !== null}
                  onChange={(on) =>
                    onChange(
                      toggleAdHocOptimize(
                        value,
                        on,
                        integer && !withStep
                          ? AD_HOC_DEFAULT_COUNT_OPTIMIZE
                          : AD_HOC_DEFAULT_OPTIMIZE,
                      ),
                    )
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
