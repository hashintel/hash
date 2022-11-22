import { uniqueId } from "lodash";
import {
  forwardRef,
  ChangeEvent,
  useCallback,
  useState,
  HTMLProps,
} from "react";

type SelectInputProps = {
  label?: string;
  labelClass?: string;
  onChangeValue?: (value: string) => void;
  value?: string;
  options: { disabled?: boolean; label: string; value: string }[];
} & Omit<HTMLProps<HTMLSelectElement>, "value">;

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
      <div style={tw`flex flex-col ${className}`}>
        {label && (
          <label
            htmlFor={inputId}
            style={tw`${labelClass} mb-1 uppercase text-sm font-semibold`}
          >
            {label}
          </label>
        )}
        <select
          id={inputId}
          style={tw`border(1 gray-300 hover:gray-400 focus:gray-500) ${
            !value ? "text-gray-400" : ""
          }  bg-white focus:outline-none rounded-lg h-11 px-5 mb-2 w-full `}
          onChange={_onChange}
          ref={ref}
          {...(value && { value })}
          {...(placeholder && { defaultValue: "" })}
          {...props}
        >
          {placeholder && (
            <option value="" disabled style={tw`hidden`}>
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
