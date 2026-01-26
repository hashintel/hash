import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const numberInputStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.15)]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
    fontFamily: "[monospace]",
  },
  variants: {
    isDisabled: {
      true: {
        backgroundColor: "[rgba(0, 0, 0, 0.02)]",
        cursor: "not-allowed",
      },
      false: {
        backgroundColor: "[white]",
        cursor: "text",
      },
    },
    hasError: {
      true: {
        borderColor: "[#ef4444]",
      },
      false: {},
    },
  },
  defaultVariants: {
    isDisabled: false,
    hasError: false,
  },
});

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Whether the input has an error */
  hasError?: boolean;
  /** Ref to the input element */
  ref?: React.Ref<HTMLInputElement>;
}

const NumberInputBase: React.FC<NumberInputProps> = ({
  hasError = false,
  disabled,
  className,
  ref,
  ...props
}) => (
  <input
    ref={ref}
    type="number"
    disabled={disabled}
    className={`${numberInputStyle({ isDisabled: disabled, hasError })}${className ? ` ${className}` : ""}`}
    {...props}
  />
);

export const NumberInput = withTooltip(NumberInputBase, "block");
