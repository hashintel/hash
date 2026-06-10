import { css, cx } from "@hashintel/ds-helpers/css";

import { BaseInput, type BaseInputProps } from "../TextInput/base-input";

// Disable scrolling over a number input while it is focused
// this prevents accidental changing of input while scrolling. The listener is
// added on focus and removed on blur, so we need a stable reference here.
const preventWheel = (event: WheelEvent) => {
  event.preventDefault();
};

const integerBlockedKeys = new Set([".", "e", "E", "+"]);

// The base recipe only hides spin buttons via `opacity: 0` when unfocused so
// their layout space is preserved; on focus they reappear. `hideStepper`
// removes them entirely.
const hideStepperStyle = css({
  "& input[type=number]::-webkit-outer-spin-button": {
    display: "none",
  },
  "& input[type=number]::-webkit-inner-spin-button": {
    display: "none",
  },
});

export const NumberInput = ({
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  inputMode,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  hideStepper,
  className,
  ...props
}: Omit<
  BaseInputProps,
  "type" | "maxLength" | "spellcheck" | "value" | "onChange"
> & {
  value: number | null | undefined;
  hideStepper?: boolean;
  onChange: (
    value: number | null,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
}) => {
  const isInteger = step !== "any" && Number.isInteger(step);
  if (isInteger ? max > Number.MAX_SAFE_INTEGER : max > Number.MAX_VALUE) {
    // eslint-disable-next-line no-console
    console.error(
      isInteger
        ? "The max number should be a safe js integer value"
        : "The max number should be a safe float value",
    );
  }

  return (
    <BaseInput
      {...props}
      className={cx(hideStepper && hideStepperStyle, className)}
      type="number"
      value={value?.toString() ?? null}
      min={min}
      max={max}
      step={step}
      inputMode={inputMode ?? (isInteger ? "numeric" : "decimal")}
      onFocus={(event) => {
        onFocus?.(event);
        event.target.addEventListener("wheel", preventWheel, {
          passive: false,
        });
      }}
      onBlur={(event) => {
        onBlur?.(event);
        event.target.removeEventListener("wheel", preventWheel);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          isInteger &&
          !event.defaultPrevented &&
          integerBlockedKeys.has(event.key)
        ) {
          event.preventDefault();
        }
      }}
      onChange={(newValue, event) => {
        const parsedRaw = isInteger
          ? parseInt(newValue, 10)
          : parseFloat(newValue);
        const parsed =
          isInteger && !Number.isNaN(parsedRaw)
            ? Math.trunc(parsedRaw)
            : parsedRaw;
        onChange(Number.isNaN(parsed) ? null : parsed, event);
      }}
    />
  );
};
