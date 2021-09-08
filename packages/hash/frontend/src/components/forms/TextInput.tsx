import { ChangeEvent, forwardRef } from "react";
import { InputLabelWrapper } from "./InputLabelWrapper";
import { tw } from "twind";

type TextInputProps = {
  disallowRegExp?: RegExp;
  label?: string;
  onChange: (newText: string) => void;
  value: string;
} & Omit<React.HTMLProps<HTMLInputElement>, "label" | "onChange" | "value">;

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ disallowRegExp, label, onChange, value, ...props }, ref) => {
    const _onChange = ({ target }: ChangeEvent<HTMLInputElement>) =>
      onChange(
        disallowRegExp ? target.value.replace(disallowRegExp, "") : target.value
      );

    const Input = (
      <input
        type="text"
        {...props}
        className={tw`${
          props.className ?? ""
        } bg-gray-100  border(1 gray-300 hover:gray-500 focus:gray-500) focus:outline-none rounded-lg h-11 py-4 px-5 mb-2`}
        onChange={_onChange}
        ref={ref}
        value={value}
      />
    );

    if (label) {
      return <InputLabelWrapper label={label}>{Input}</InputLabelWrapper>;
    }

    return Input;
  }
);
