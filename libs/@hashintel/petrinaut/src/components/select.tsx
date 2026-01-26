import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const selectStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.1)]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "pointer",
      },
    },
  },
  defaultVariants: {
    isDisabled: false,
  },
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** Ref to the select element */
  ref?: React.Ref<HTMLSelectElement>;
}

const SelectBase: React.FC<SelectProps> = ({
  disabled,
  className,
  children,
  ref,
  ...props
}) => (
  <select
    ref={ref}
    disabled={disabled}
    className={`${selectStyle({ isDisabled: disabled })}${className ? ` ${className}` : ""}`}
    {...props}
  >
    {children}
  </select>
);

export const Select = withTooltip(SelectBase, "block");
