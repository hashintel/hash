/**
 * The editor every value slot opens: a small popover anchored on the slot
 * whose header names the slot in the attribution notation (`Space › x`), a
 * Monaco single-line expression editor type-checked through the form's LSP
 * session, and — where optimization is available — an Optimize toggle
 * bottom-right behind a thin border. Turning Optimize on replaces the
 * expression editor with Min/Max/Scale (and Step where definable) in the same
 * slot; the core transition retains bounds and expression alike, so toggling
 * destroys nothing.
 *
 * A closed slot still shows its problems: the trigger underlines in red and
 * carries the first synthesis error or LSP diagnostic as its tooltip.
 */

import { use, useRef, useState } from "react";

import { Popover, Select, TextInput, Toggle } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  AD_HOC_DEFAULT_COUNT_OPTIMIZE,
  AD_HOC_DEFAULT_OPTIMIZE,
  toggleAdHocOptimize,
} from "@hashintel/petrinaut-core";

import { CodeEditor } from "../../monaco/code-editor";
import { AdHocFormContext } from "./form-context";

import type { AdHocValue, AdHocValueTarget } from "@hashintel/petrinaut-core";

const triggerStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  maxWidth: "[100%]",
  minWidth: "[24px]",
  paddingX: "1",
  paddingY: "0.5",
  borderRadius: "xs",
  fontFamily: "mono",
  fontSize: "xs",
  color: "neutral.s110",
  cursor: "pointer",
  textAlign: "left",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  _hover: { backgroundColor: "neutral.s20" },
});

const optimizedTriggerStyle = css({
  backgroundColor: "purple.s20",
  color: "purple.s110",
  _hover: { backgroundColor: "purple.s30" },
});

const derivedTriggerStyle = css({
  opacity: "[0.55]",
});

const placeholderTriggerStyle = css({
  color: "neutral.s70",
});

const errorTriggerStyle = css({
  textDecorationLine: "underline",
  textDecorationStyle: "wavy",
  textDecorationColor: "red.s90",
  textUnderlineOffset: "[3px]",
});

const popoverHeaderStyle = css({
  paddingX: "2",
  paddingTop: "2",
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.02em]",
  color: "neutral.s80",
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
});

const editorBodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  width: "[280px]",
  padding: "2",
});

const boundsGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "2",
});

const boundFieldStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  minWidth: "[0]",
});

const boundLabelStyle = css({
  fontSize: "[10px]",
  color: "neutral.s80",
});

const fieldErrorStyle = css({
  fontSize: "[10px]",
  color: "red.s100",
});

// The editor's own container carries `flex: 1` for row layouts; hosting it in
// a row keeps that meaning width, not a zeroed flex-basis height.
const expressionRowStyle = css({
  display: "flex",
});

const optimizeRowStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: "2",
  paddingTop: "2",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  fontSize: "xs",
  color: "neutral.s100",
});

export interface ValueEditorProps {
  value: AdHocValue;
  onChange: (value: AdHocValue) => void;
  /** The slot's attribution path, used as the accessible name and popover title. */
  label: string;
  /** The slot's location, joining it to LSP diagnostics and synthesis errors. */
  target: AdHocValueTarget;
  /** Whether the Optimize toggle exists at all. */
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
}

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
}) => {
  const { errorFor, uriFor } = use(AdHocFormContext);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(autoOpen > 0);

  // Render-adjusted state: a fresh auto-open nonce opens the editor without
  // an effect (materialized phantom rows, derived-cell click-through).
  const [seenAutoOpen, setSeenAutoOpen] = useState(autoOpen);
  if (autoOpen !== seenAutoOpen) {
    setSeenAutoOpen(autoOpen);
    if (autoOpen > 0) {
      setOpen(true);
    }
  }

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
  // Errors stay off the trigger while the editor is open — Monaco marks them
  // inline and the bound fields show their own.
  const showTriggerError = error !== undefined && !open;

  const boundField = (
    part: "min" | "max" | "step",
    fieldLabel: string,
    fieldValue: string,
    setBound: (next: string) => void,
  ) => {
    const boundError = errorFor({ target, part });
    return (
      <div className={boundFieldStyle}>
        <span className={boundLabelStyle}>{fieldLabel}</span>
        <TextInput
          size="sm"
          aria-label={`${fieldLabel} of ${label}`}
          value={fieldValue}
          onChange={setBound}
        />
        {boundError ? (
          <span className={fieldErrorStyle}>{boundError}</span>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
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
      >
        {derived ? `⌃ ${text}` : text}
      </button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position="bottom-start"
          onClose={() => setOpen(false)}
        >
          <Popover.Container>
            <Popover.Body withPadding={false}>
              <div className={popoverHeaderStyle}>{label}</div>
              <div className={editorBodyStyle}>
                {optimized && booleanDomain ? (
                  <div className={boundLabelStyle}>
                    The optimizer tries true and false.
                  </div>
                ) : optimized ? (
                  <div className={boundsGridStyle}>
                    {boundField("min", "Min", value.optimize!.min, (min) =>
                      onChange({
                        ...value,
                        optimize: { ...value.optimize!, min },
                      }),
                    )}
                    {boundField("max", "Max", value.optimize!.max, (max) =>
                      onChange({
                        ...value,
                        optimize: { ...value.optimize!, max },
                      }),
                    )}
                    <div className={boundFieldStyle}>
                      <span className={boundLabelStyle}>Scale</span>
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
                    {integer && withStep
                      ? boundField(
                          "step",
                          "Step",
                          value.optimize!.step ?? "1",
                          (step) =>
                            onChange({
                              ...value,
                              optimize: { ...value.optimize!, step },
                            }),
                        )
                      : null}
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
                      onSubmit={() => setOpen(false)}
                    />
                  </div>
                )}
                {optimizable ? (
                  <div className={optimizeRowStyle}>
                    <span>Optimize</span>
                    <Toggle
                      size="xs"
                      aria-label={`Optimize ${label}`}
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
              </div>
            </Popover.Body>
          </Popover.Container>
        </Popover>
      ) : null}
    </>
  );
};
