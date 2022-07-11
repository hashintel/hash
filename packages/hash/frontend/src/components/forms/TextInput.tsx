import { ChangeEvent, forwardRef } from "react";
import { tw } from "twind";
import { InputLabelWrapper } from "./InputLabelWrapper";

type TextInputProps = {
  disallowRegExp?: RegExp;
  label?: string;
  onChange?: (evt: ChangeEvent<HTMLInputElement>) => void;
  onChangeText?: (newText: string) => void;
  value?: string;
  transparent?: boolean;
  inputClassName?: string;
} & Omit<React.HTMLProps<HTMLInputElement>, "label" | "value" | "onChange">;

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      disallowRegExp,
      label,
      onChange,
      onChangeText,
      value,
      transparent,
      type,
      inputClassName,
      ...props
    },
    ref,
  ) => {
    const _onChange = (evt: ChangeEvent<HTMLInputElement>) => {
      if (onChangeText) {
        onChangeText(
          disallowRegExp
            ? evt.target.value.replace(disallowRegExp, "")
            : evt.target.value,
        );
      } else {
        onChange?.(evt);
      }
    };

    const Input = (
      <input
        type={type || "text"}
        {...props}
        className={tw`${
          transparent ? "" : "bg-gray-100"
        } border(1 solid gray-300 hover:gray-400 focus:gray-500) focus:outline-none rounded-lg h-11 py-4 px-5 w-full ${
          inputClassName ?? ""
        }`}
        onChange={_onChange}
        ref={ref}
        {...(value !== undefined ? { value } : {})}
      />
    );

    if (label) {
      return (
        <div className={props.className}>
          <InputLabelWrapper label={label}>{Input}</InputLabelWrapper>
        </div>
      );
    }

    return <div className={props.className}>{Input}</div>;
  },
);
