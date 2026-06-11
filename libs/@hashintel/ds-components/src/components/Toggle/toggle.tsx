import { Switch } from "@ark-ui/react/switch";

import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./toggle.recipe";

import type { SharedInputProps, Tone } from "../../util/form-shared";

export type ToggleProps = {
  tone?: Tone;
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
  labelOnText,
  labelOffText,
  ...ariaProps
}: ToggleProps) => {
  const classes = styles({ size, tone, invalid: !!invalid });

  return (
    <Switch.Root
      checked={value}
      onCheckedChange={(details) => onChange(details.checked)}
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
