import { BaseInput, type BaseInputProps } from "../TextInput/base-input";

// Disable scrolling over a number input while it is focused
// this prevents accidental changing of input while scrolling. The listener is
// added on focus and removed on blur, so we need a stable reference here.
const preventWheel = (event: WheelEvent) => {
  event.preventDefault();
};

type NumberType<T extends boolean | undefined> = T extends true
  ? number
  : number | null;

const integerBlockedKeys = new Set([".", "e", "E", "+"]);

export const NumberInput = <RequiredType extends boolean | undefined>({
  type,
  value,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  inputMode,
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  ...props
}: Omit<
  BaseInputProps,
  "type" | "maxLength" | "spellcheck" | "value" | "onChange"
> & {
  type: "integer" | "float";
  value: number | null | undefined;
  onChange: (
    value: NumberType<RequiredType>,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => void;
  required?: RequiredType;
}) => {
  if (
    type === "integer" ? max > Number.MAX_SAFE_INTEGER : max > Number.MAX_VALUE
  ) {
    // eslint-disable-next-line no-console
    console.error(
      type === "integer"
        ? "The max number should be a safe js integer value"
        : "The max number should be a safe float value",
    );
  }

  return (
    <BaseInput
      {...props}
      type="number"
      value={value?.toString() ?? null}
      min={min}
      max={max}
      step={type === "integer" ? 1 : undefined}
      inputMode={inputMode ?? (type === "integer" ? "numeric" : "decimal")}
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
          type === "integer" &&
          !event.defaultPrevented &&
          integerBlockedKeys.has(event.key)
        ) {
          event.preventDefault();
        }
      }}
      onChange={(newValue, event) => {
        const parsedRaw =
          type === "integer" ? parseInt(newValue, 10) : parseFloat(newValue);
        const parsed =
          type === "integer" && !Number.isNaN(parsedRaw)
            ? Math.trunc(parsedRaw)
            : parsedRaw;
        onChange(
          (Number.isNaN(parsed) ? null : parsed) as NumberType<RequiredType>,
          event,
        );
      }}
    />
  );
};
