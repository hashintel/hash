import { Switch } from "@ark-ui/react/switch";

import { cx } from "@hashintel/ds-helpers/css";

import { useFieldId } from "../Form/field-id-context";
import { styles } from "./toggle.recipe";

import type { SharedInputProps, Tone } from "../../util/form-shared";

export type ToggleProps = {
  /** The tone applied when the toggle is on (checked) */
  tone?: Exclude<Tone, "error"> | "success";
  /** The tone applied when the toggle is off (unchecked) */
  offTone?: "neutral" | "error";
  labelOnText?: string;
  labelOffText?: string;
} & SharedInputProps<HTMLInputElement, boolean> &
  React.AriaAttributes;

export const Toggle = ({
  className,
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
  disabled,
  required,
  size = "md",
  tone = "neutral",
  offTone = "neutral",
  labelOnText,
  labelOffText,
  ...ariaProps
}: ToggleProps) => {
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;
  const classes = styles({ size, tone, offTone, invalid: !!invalid });

  return (
    <Switch.Root
      checked={value}
      onCheckedChange={(details) => onChange(details.checked)}
      name={name}
      disabled={disabled}
      invalid={invalid}
      required={required}
      ids={inputId ? { hiddenInput: inputId } : undefined}
      data-testid={testId}
      ref={ref as React.Ref<HTMLLabelElement>}
      className={cx(classes.root, className)}
      {...ariaProps}
    >
      {labelOffText !== undefined && (
        <Switch.Label className={classes.label}>{labelOffText}</Switch.Label>
      )}
      <Switch.Control className={classes.control}>
        <Switch.Thumb className={classes.thumb} />
      </Switch.Control>
      {labelOnText !== undefined && (
        <Switch.Label className={classes.label}>{labelOnText}</Switch.Label>
      )}
      <Switch.HiddenInput
        ref={inputRef}
        autoFocus={autoFocus}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </Switch.Root>
  );
};
