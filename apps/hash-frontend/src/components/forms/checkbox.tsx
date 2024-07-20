import type { FunctionComponent, HTMLProps } from "react";

type CheckboxProps = {
  checked: boolean;
  onChangeChecked: (value: boolean) => void;
  label?: string;
} & Omit<HTMLProps<HTMLInputElement>, "onChange">;

export const Checkbox: FunctionComponent<CheckboxProps> = ({
  checked,
  label,
  onChangeChecked,
  ...props
}) => {
  if (label) {
    return (
      <div>
        <label>
          {label}
          <input
            checked={checked}
            type={"checkbox"}
            onChange={() => {
              onChangeChecked(!checked);
            }}
            {...props}
          />
        </label>
      </div>
    );
  }

  return (
    <div>
      <input
        checked={checked}
        type={"checkbox"}
        onChange={() => {
          onChangeChecked(!checked);
        }}
        {...props}
      />
    </div>
  );
};
