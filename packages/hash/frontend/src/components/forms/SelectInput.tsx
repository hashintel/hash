import React, { forwardRef, ChangeEvent, useCallback } from "react";
import { tw } from "twind";
import { InputLabelWrapper } from "./InputLabelWrapper";

type SelectInputProps = {
  label?: string;
  onChangeValue?: (value: string) => void;
  value?: string;
  options: { label: string; value: string }[];
} & Omit<React.HTMLProps<HTMLSelectElement>, "value">;

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ label, onChange, onChangeValue, options, ...props }, ref) => {
    const _onChange = useCallback(
      (e: ChangeEvent<HTMLSelectElement>) => {
        if (onChangeValue) {
          onChangeValue(e.target.value);
        } else {
          onChange?.(e);
        }
      },
      [onChange, onChangeValue]
    );

    const renderSelect = () => {
      return (
        <select
          className={tw`border(1 gray-300 hover:gray-400 focus:gray-500) bg-transparent focus:outline-none rounded-lg h-11 px-5 mb-2 w-full`}
          onChange={_onChange}
          ref={ref}
        >
          {options.map(({ label, value }) => (
            <option value={value}>{label}</option>
          ))}
        </select>
      );
    };

    if (label) {
      return (
        <div className={`w-64 ${props.className ?? ""}`}>
          <InputLabelWrapper label={label}>{renderSelect()}</InputLabelWrapper>
        </div>
      );
    }
    return (
      <div className={`w-64 ${props.className ?? ""}`}>{renderSelect()}</div>
    );
  }
);
