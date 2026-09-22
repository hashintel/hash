import { BaseInput, type BaseInputProps } from "./base-input";

export const TextInput = (
  props: Omit<BaseInputProps, "min" | "max" | "step" | "inputElementProps">,
) => {
  return <BaseInput {...props} />;
};
