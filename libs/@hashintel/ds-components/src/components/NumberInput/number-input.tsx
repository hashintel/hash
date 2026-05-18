import { BaseInput, type BaseInputProps } from "../TextInput/base-input";

type NumberType<T extends boolean | undefined> = T extends true
  ? number
  : number | null;

export const NumberInput = <RequiredType extends boolean | undefined>({
  value,
  onChange,
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
