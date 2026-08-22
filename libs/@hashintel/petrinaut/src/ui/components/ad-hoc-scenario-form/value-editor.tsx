/**
 * The editor every value slot opens: a small popover anchored on the slot
 * showing the expression, and — where optimization is available — an Optimize
 * toggle whose activation replaces the expression editor with Min/Max/Scale
 * (and Step for integers) in the same place. Toggling never destroys either
 * side: the core transition retains bounds and expression alike.
 */

import { useRef, useState } from "react";

import { Popover, Select, TextInput, Toggle } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { toggleAdHocOptimize } from "@hashintel/petrinaut-core";

import type { AdHocValue } from "@hashintel/petrinaut-core";

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

const editorBodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  width: "[240px]",
  padding: "2",
});

const boundsRowStyle = css({
  display: "flex",
  gap: "2",
  "& > *": { flex: "1", minWidth: "[0]" },
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
  /** What the slot is, for the trigger's accessible name. */
  label: string;
  /** Whether the Optimize toggle exists at all. */
  optimizable: boolean;
  /** Integer slots also expose a Step bound. */
  integer?: boolean;
  /**
   * Rendered as derived: dimmed, and editing is delegated to the shared
   * column's own editor by the parent instead of opening this one.
   */
  derived?: boolean;
  /** Extra classname for the trigger. */
  className?: string;
  /** Overrides the trigger text (defaults to the expression). */
  display?: string;
  onOpenDerived?: () => void;
}

export const ValueEditor: React.FC<ValueEditorProps> = ({
  value,
  onChange,
  label,
  optimizable,
  integer = false,
  derived = false,
  className,
  display,
  onOpenDerived,
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const optimized = optimizable && value.optimize !== null;
  const text =
    display ??
    (optimized
      ? `${value.optimize!.min} – ${value.optimize!.max}`
      : value.expression || "…");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        className={cx(
          triggerStyle,
          optimized && optimizedTriggerStyle,
          derived && derivedTriggerStyle,
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
              <div className={editorBodyStyle}>
                {optimized ? (
                  <>
                    <div className={boundsRowStyle}>
                      <TextInput
                        size="sm"
                        aria-label="Minimum"
                        value={value.optimize!.min}
                        onChange={(min) =>
                          onChange({
                            ...value,
                            optimize: { ...value.optimize!, min },
                          })
                        }
                      />
                      <TextInput
                        size="sm"
                        aria-label="Maximum"
                        value={value.optimize!.max}
                        onChange={(max) =>
                          onChange({
                            ...value,
                            optimize: { ...value.optimize!, max },
                          })
                        }
                      />
                    </div>
                    <div className={boundsRowStyle}>
                      <Select
                        size="sm"
                        aria-label="Scale"
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
                      {integer ? (
                        <TextInput
                          size="sm"
                          aria-label="Step"
                          value={value.optimize!.step ?? "1"}
                          onChange={(step) =>
                            onChange({
                              ...value,
                              optimize: { ...value.optimize!, step },
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </>
                ) : (
                  <TextInput
                    size="sm"
                    aria-label="Expression"
                    value={value.expression}
                    onChange={(expression) =>
                      onChange({ ...value, expression })
                    }
                  />
                )}
                {optimizable ? (
                  <div className={optimizeRowStyle}>
                    <span>Optimize</span>
                    <Toggle
                      size="xs"
                      value={value.optimize !== null}
                      onChange={(on) =>
                        onChange(toggleAdHocOptimize(value, on))
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
