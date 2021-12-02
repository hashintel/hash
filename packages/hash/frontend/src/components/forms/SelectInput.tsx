import { uniqueId } from "lodash";
import React, { forwardRef, ChangeEvent, useCallback, useState } from "react";
import { tw } from "twind";

type SelectInputProps = {
  label?: string;
  labelClass?: string;
  onChangeValue?: (value: string) => void;
  value?: string;
  options: { disabled?: boolean; label: string; value: string }[];
} & Omit<React.HTMLProps<HTMLSelectElement>, "value">;

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(
  (
    {
      className,
      label,
      onChange,
      onChangeValue,
      id,
      options,
      labelClass,
      placeholder,
      value,
      ...props
    },
    ref,
  ) => {
    const [inputId, _] = useState(() => id ?? uniqueId());

    const _onChange = useCallback(
      (evt: ChangeEvent<HTMLSelectElement>) => {
        if (onChangeValue) {
          onChangeValue(evt.target.value);
        } else {
          onChange?.(evt);
        }
      },
      [onChange, onChangeValue],
    );

    return (
      <div className={tw`flex flex-col ${className}`}>
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
          className={tw`border(1 gray-300 hover:gray-400 focus:gray-500) ${
            !value ? "text-gray-400" : ""
          }  bg-white focus:outline-none rounded-lg h-11 px-5 mb-2 w-full `}
          onChange={_onChange}
          ref={ref}
          {...(value && { value })}
          {...(placeholder && { defaultValue: "" })}
          {...props}
        >
          {placeholder && (
            <option value="" disabled className={tw`hidden`}>
              {placeholder || "---"}
            </option>
          )}
          {options.map(
            ({ disabled, label: optionLabel, value: optionValue }) => (
              <option disabled={disabled} key={optionValue} value={optionValue}>
                {optionLabel}
              </option>
            ),
          )}
        </select>
      </div>
    );
  },
);
