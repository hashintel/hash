import { BaseInput, type BaseInputProps } from "../TextInput/base-input";

// Disable scrolling over a number input while it is focused
// this prevents accidental changing of input while scrolling
const preventNumberScroll: React.FocusEventHandler<HTMLInputElement> = (
  event,
) => {
  event.target.addEventListener(
    "wheel",
    (event2) => {
      event2.preventDefault();
    },
    { passive: false },
  );
};

type NumberType<T extends boolean | undefined> = T extends true
  ? number
  : number | null;

export const NumberInput = <RequiredType extends boolean | undefined>({
  value,
  onChange,
  onFocus,
  ...props
}: Omit<
  BaseInputProps,
  "type" | "maxLength" | "pattern" | "spellcheck" | "value" | "onChange"
> & {
  value: number | null | undefined;
  onChange: (value: NumberType<RequiredType>) => void;
  required?: RequiredType;
}) => {
  return (
    <BaseInput
      {...props}
      type="number"
      value={value?.toString() ?? null}
      onFocus={(event) => {
        onFocus?.(event);
        preventNumberScroll(event);
      }}
      onChange={(newValue, event) => {
        if (event.target.checkValidity()) {
          if (newValue) {
            // There is a valid number, and it's valid.
            onChange(parseInt(newValue, 10));
          } else {
            // If valid, and there's no value, it must not be required; return null.
            onChange(null as NumberType<RequiredType>);
          }
        } else if (!newValue) {
          // We must have a required field and the user is emptying the value. This is not allowed, so return 0
          onChange(0);
        }
      }}
    />
  );
};
