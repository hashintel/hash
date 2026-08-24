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

import { use, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Select, TextInput } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  AD_HOC_DEFAULT_COUNT_OPTIMIZE,
  AD_HOC_DEFAULT_OPTIMIZE,
  toggleAdHocOptimize,
} from "@hashintel/petrinaut-core";

import { CodeEditor } from "../../monaco/code-editor";
import { AdHocFormContext } from "./form-context";
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
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
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

// The open editor sits exactly over the cell; the path floats above it and
// the Optimize control below, both quieter than the content.
const overlayStyle = css({
  position: "fixed",
  zIndex: "[1000]",
});

const overlayBodyStyle = css({
  backgroundColor: "neutral.s00",
  boxShadow: "[0 0 0 2px {colors.blue.s50}, 0 4px 12px -4px rgba(0,0,0,0.15)]",
  borderRadius: "xs",
  display: "flex",
});

const pathLabelStyle = css({
  position: "absolute",
  bottom: "[100%]",
  left: "[0]",
  marginBottom: "[2px]",
  paddingX: "1",
  paddingY: "[1px]",
  borderRadius: "xs",
  backgroundColor: "neutral.s15",
  fontSize: "[9px]",
  fontFamily: "mono",
  color: "neutral.s80",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

const belowStripStyle = css({
  position: "absolute",
  top: "[100%]",
  left: "[0]",
  marginTop: "[3px]",
  display: "flex",
  alignItems: "center",
  gap: "1.5",
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
  /** The slot's attribution path, used as the accessible name and floating label. */
  label: string;
  /** The slot's location, joining it to LSP diagnostics and synthesis errors. */
  target: AdHocValueTarget;
  /** Whether the Optimize control exists at all. */
  optimizable: boolean;
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
  label,
  target,
  optimizable,
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
  const { errorFor, uriFor } = use(AdHocFormContext);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(autoOpen > 0);
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

  // The overlay tracks the cell through scrolling and resizes, and closes on
  // any pointer press outside itself.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onScrollOrResize = () => measure();
    const onPointerDown = (event: PointerEvent) => {
      const overlay = overlayRef.current;
      if (overlay && event.target instanceof Node) {
        if (
          !overlay.contains(event.target) &&
          !buttonRef.current?.contains(event.target)
        ) {
          setOpen(false);
        }
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

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
  ) => (
    <div className={boundFieldStyle}>
      <TextInput
        size="sm"
        aria-label={`${fieldLabel} of ${label}`}
        placeholder={fieldLabel}
        value={fieldValue}
        onChange={setBound}
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
        className={cx(
          triggerStyle,
          optimized && optimizedTriggerStyle,
          derived && derivedTriggerStyle,
          isEmpty && placeholderTriggerStyle,
          showTriggerError && errorTriggerStyle,
          className,
        )}
        tabIndex={derived ? -1 : 0}
        onClick={() => {
          if (derived) {
            onOpenDerived?.();
            return;
          }
          setOpen(true);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={triggerTextStyle}>{derived ? `⌃ ${text}` : text}</span>
      </button>
      {open && rect
        ? createPortal(
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
                    {boundField("Min", value.optimize!.min, (min) =>
                      onChange({
                        ...value,
                        optimize: { ...value.optimize!, min },
                      }),
                    )}
                    {boundField("Max", value.optimize!.max, (max) =>
                      onChange({
                        ...value,
                        optimize: { ...value.optimize!, max },
                      }),
                    )}
                    {integer && withStep
                      ? boundField(
                          "Step",
                          value.optimize!.step ?? "1",
                          (step) =>
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
                      language="typescript"
                      path={uriFor(expressionSlot) || undefined}
                      value={value.expression}
                      placeholder={placeholder}
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
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
