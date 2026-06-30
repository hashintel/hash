import { Checkbox as BaseCheckbox } from "@ark-ui/react/checkbox";

import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./checkbox.recipe";

import type { SharedInputProps, Tone } from "../../util/form-shared";

export const Checkbox = ({
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
  ref,
  inputRef,
  autoFocus,
  indeterminate = false,
  labelPlacement = "right",
  labelAlign = "top",
  label,
  tone = "neutral",
  ...ariaProps
}: {
  /** An optional label rendered alongside the box */
  label?: React.ReactNode;
  /** Which side of the box the label is rendered on */
  labelPlacement?: "left" | "right";
  /** Vertical alignment of the box against the label when it wraps over multiple lines */
  labelAlign?: "top" | "center";
  /** The tone applied when the checkbox is checked */
  tone?: Exclude<Tone, "error"> | "success";
  /** Render the box in the indeterminate ("partially checked") state */
  indeterminate?: boolean;
} & SharedInputProps<HTMLInputElement, boolean> &
  React.AriaAttributes) => {
  const classes = styles({
    size,
    tone,
    invalid: !!invalid,
    labelPlacement,
    labelAlign,
  });

  return (
    <BaseCheckbox.Root
      checked={indeterminate ? "indeterminate" : value}
      onCheckedChange={(details) => onChange(details.checked === true)}
      name={name}
      disabled={disabled}
      invalid={invalid}
      required={required}
      ids={htmlForId ? { hiddenInput: htmlForId } : undefined}
      data-testid={testId}
      ref={ref as React.Ref<HTMLLabelElement>}
      className={cx(classes.root, className)}
      {...ariaProps}
    >
      <BaseCheckbox.Control className={classes.control}>
        <BaseCheckbox.Indicator
          indeterminate={indeterminate}
          className={classes.indicator}
          asChild
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3px"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>{indeterminate ? "Partially checked" : "Checked"}</title>
            {indeterminate ? (
              <path d="M5 12h14" />
            ) : (
              <path d="M20 6 9 17l-5-5" />
            )}
          </svg>
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Control>
      {label && (
        <BaseCheckbox.Label className={classes.label}>
          {label}
        </BaseCheckbox.Label>
      )}
      <BaseCheckbox.HiddenInput
        ref={inputRef}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </BaseCheckbox.Root>
  );
};
