import type { ChangeEvent, CSSProperties, forwardRef, HTMLProps } from "react";

import { InputLabelWrapper } from "./input-label-wrapper";

type TextInputProps = {
  disallowRegExp?: RegExp;
  label?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onChangeText?: (newText: string) => void;
  value?: string;
  transparent?: boolean;
  inputStyle?: CSSProperties;
} & Omit<HTMLProps<HTMLInputElement>, "label" | "value" | "onChange">;

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      disallowRegExp,
      label,
      onChange,
      onChangeText,
      value,
      transparent,
      type = "text",
      inputStyle,
      ...props
    },
    ref,
  ) => {
    const _onChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (onChangeText) {
        onChangeText(
          disallowRegExp
            ? event.target.value.replace(disallowRegExp, "")
            : event.target.value,
        );
      } else {
        onChange?.(event);
      }
    };

    const Input = (
      <input
        type={type}
        {...props}
        ref={ref}
        style={{
          ...(transparent ? {} : { backgroundColor: "#F3F4F6" }),
          borderRadius: "0.5rem",
          height: "2.75rem",
          paddingBottom: "1rem",
          paddingLeft: "1.25rem",
          paddingRight: "1.25rem",
          paddingTop: "1rem",
          width: "100%",
          ...inputStyle,
        }}
        onChange={_onChange}
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
