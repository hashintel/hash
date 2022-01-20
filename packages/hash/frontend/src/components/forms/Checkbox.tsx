import { HTMLProps, VoidFunctionComponent } from "react";

type CheckboxProps = {
  checked: boolean;
  onChangeChecked: (value: boolean) => void;
  label?: string;
} & Omit<HTMLProps<HTMLInputElement>, "onChange">;

export const Checkbox: VoidFunctionComponent<CheckboxProps> = ({
  checked,
  label,
  onChangeChecked,
  ...props
}) => {
  if (label) {
    return (
      <div>
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label>
          {label}
          <input
            checked={checked}
            onChange={() => onChangeChecked(!checked)}
            type="checkbox"
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
        onChange={() => onChangeChecked(!checked)}
        type="checkbox"
        {...props}
      />
    </div>
  );
};
