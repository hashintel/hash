import { css, cx } from "@hashintel/ds-helpers/css";

import { BaseInput, type BaseInputProps } from "../TextInput/base-input";

import type { FormInputWidth } from "../../util/form-shared";

// Disable scrolling over a number input while it is focused
// this prevents accidental changing of input while scrolling. The listener is
// added on focus and removed on blur, so we need a stable reference here.
const preventWheel = (event: WheelEvent) => {
  event.preventDefault();
};

const integerBlockedKeys = new Set([".", "e", "E", "+"]);

const getStepPrecision = (step: number): number => {
  const stepStr = String(step);
  const decimalIdx = stepStr.indexOf(".");
  return decimalIdx >= 0 ? stepStr.length - decimalIdx - 1 : 0;
};

const getMaxNumberCharCount = (max: number, step: number | "any"): number => {
  const integerDigits = Math.max(1, String(Math.floor(Math.abs(max))).length);
  if (step === "any" || Number.isInteger(step)) {
    return integerDigits;
  }
  const precision = getStepPrecision(step);
  // +0.5 for the decimal point (narrower than a digit)
  return integerDigits + precision + 0.5;
};

const numberInputStyle = css({
  // Number inputs can be much smaller than text inputs. Size to fit two digits
  // (the `0` advance width × 2) plus the input's horizontal padding on each side.
  "--form-min-width": "[calc(2ch + 2 * var(--base-input-padding-x))]",
});

const subtleNumberInputStyle = css({
  // Number inputs can be much smaller than text inputs. Size to fit two digits
  // (the `0` advance width × 2) plus the input's horizontal padding on each side.
  "--form-min-width": "[2ch]",
});

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
  width,
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
  "type" | "maxLength" | "spellcheck" | "value" | "onChange" | "width"
> & {
  value: number | null | undefined;
  // maxNumber sets the width to be equal to the width of the max value if set, assuming that stepper is hidden
  width?: FormInputWidth | "maxNumber";
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

  let style;
  if (
    width === "maxNumber" &&
    !(max === Number.MAX_SAFE_INTEGER && step === "any")
  ) {
    const charCount = getMaxNumberCharCount(max, step);
    style = {
      ...props.style,
      width: `calc(${charCount}ch +${props.variant === "subtle" ? "" : " 2 * var(--base-input-padding-x) +"} ${charCount}px)`,
    };
  } else {
    style = props.style;
  }

  return (
    <BaseInput
      {...props}
      className={cx(
        props.variant === "subtle" ? subtleNumberInputStyle : numberInputStyle,
        hideStepper && hideStepperStyle,
        className,
      )}
      style={style}
      type="number"
      value={value?.toString() ?? null}
      min={min}
      max={max}
      step={step}
      width={width === "maxNumber" ? "fullWidth" : width}
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
