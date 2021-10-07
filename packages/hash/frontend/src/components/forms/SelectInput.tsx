import { uniqueId } from "lodash";
import React, { forwardRef, ChangeEvent, useCallback, useState } from "react";
import { tw } from "twind";
import { InputLabelWrapper } from "./InputLabelWrapper";

type SelectInputProps = {
  label?: string;
  labelClass?: string;
  onChangeValue?: (value: string) => void;
  value?: string;
  options: { label: string; value: string }[];
} & Omit<React.HTMLProps<HTMLSelectElement>, "value">;

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  (
    { label, onChange, onChangeValue, id, options, labelClass, ...props },
    ref
  ) => {
    const [inputId, setInputId] = useState(() => id ?? uniqueId());

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

    return (
      <div className={tw`flex flex-col w-64`}>
        {label && (
          <label
            htmlFor={inputId}
            className={tw`${labelClass} mb-1 uppercase text-sm font-semibold`}
          >
            {label}
          </label>
        )}
        <select
          id={inputId}
          className={tw`border(1 gray-300 hover:gray-400 focus:gray-500) bg-transparent focus:outline-none rounded-lg h-11 px-5 mb-2 w-full`}
          onChange={_onChange}
          ref={ref}
        >
          {options.map(({ label, value }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    );
  }
);
