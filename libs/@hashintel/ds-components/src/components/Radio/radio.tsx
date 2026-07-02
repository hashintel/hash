import { useId } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./radio.recipe";

import type { SharedInputProps, Tone } from "../../util/form-shared";

// The value submitted by the underlying radio input when it is selected. A
// single boolean radio has no meaningful option value, so this is an arbitrary
// stable string (matching the native default for checkable inputs).
const SELECTED_VALUE = "on";

export const Radio = ({
  className,
  disabled,
  required,
  size = "md",
  name,
  value,
  onChange,
  onFocus,
  onBlur,
  invalid,
  testId,
  htmlForId,
  htmlValue,
  ref,
  inputRef,
  autoFocus,
  labelPlacement = "right",
  labelAlign = "top",
  label,
  tone = "neutral",
  ...ariaProps
}: {
  /** An optional label rendered alongside the circle */
  label?: React.ReactNode;
  /** Which side of the circle the label is rendered on */
  labelPlacement?: "left" | "right";
  /** Vertical alignment of the circle against the label when it wraps over multiple lines */
  labelAlign?: "top" | "center";
  /** The tone applied when the radio is selected */
  tone?: Exclude<Tone, "error"> | "success";
  /** An optional value used for native form submissions */
  htmlValue?: string;
} & SharedInputProps<HTMLInputElement, boolean> &
  React.AriaAttributes) => {
  const generatedId = useId();
  // Always resolve to a concrete id so the label can be explicitly linked to
  // the input (an external `<FormField>` label takes precedence via context).
  const inputId = htmlForId ?? generatedId;

  const classes = styles({
    size,
    tone,
    invalid: !!invalid,
    labelPlacement,
    labelAlign,
  });

  return (
    <label
      ref={ref as React.Ref<HTMLLabelElement>}
      htmlFor={inputId}
      className={cx(classes.root, className)}
      data-testid={testId}
      {...ariaProps}
    >
      <input
        ref={inputRef}
        type="radio"
        className={classes.input}
        id={inputId}
        name={name}
        value={htmlValue ?? SELECTED_VALUE}
        checked={value}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.checked)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <span className={classes.control} aria-hidden="true" />
      {label && <span className={classes.label}>{label}</span>}
    </label>
  );
};
