import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
} from "../../util/form-shared";

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
}: {
  tone?: "neutral" | "error";
  labelOnText?: string;
  labelOffText?: string;
} & SharedInputProps<HTMLInputElement, boolean> &
  React.AriaAttributes) => {
  return <div />;
};
