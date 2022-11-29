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
      <div
        className={className}
        style={{ display: "flex", flexDirection: "column" }}
      >
        {label && (
          <label
            htmlFor={inputId}
            className={labelClass}
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              lineHeight: "1.25rem",
              marginBottom: "0.25rem",
              textTransform: "uppercase",
            }}
          >
            {label}
          </label>
        )}
        <select
          id={inputId}
          style={{
            backgroundColor: "#ffffff",
            border: "1 px solid #D1D5DB",
            borderRadius: "0.5rem",
            color: !value ? "#9CA3AF" : undefined,
            height: "2.75rem",
            marginBottom: "0.5rem",
            paddingLeft: "1.25rem",
            paddingRight: "1.25rem",
            width: "100%",
            // (hover) border-color: #9CA3AF;
            // (focus) border-color: #6B7280;
            // (focus) outline: none;
          }}
          onChange={_onChange}
          ref={ref}
          {...(value && { value })}
          {...(placeholder && { defaultValue: "" })}
          {...props}
        >
          {placeholder && (
            <option value="" disabled style={{ display: "none" }}>
              {placeholder}
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
