import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const inputStyle = cva({
  base: {
    fontSize: "[14px]",
    padding: "[6px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.15)]",
    borderRadius: "[4px]",
    width: "[100%]",
    boxSizing: "border-box",
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
    isMonospace: {
      true: {
        fontFamily: "[monospace]",
      },
      false: {},
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
    isMonospace: false,
    hasError: false,
  },
});

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Whether to use monospace font */
  monospace?: boolean;
  /** Whether the input has an error */
  hasError?: boolean;
  /** Ref to the input element */
  ref?: React.Ref<HTMLInputElement>;
}

const InputBase: React.FC<InputProps> = ({
  monospace = false,
  hasError = false,
  disabled,
  className,
  ref,
  ...props
}) => (
  <input
    ref={ref}
    type="text"
    disabled={disabled}
    className={`${inputStyle({ isDisabled: disabled, isMonospace: monospace, hasError })}${className ? ` ${className}` : ""}`}
    {...props}
  />
);

export const Input = withTooltip(InputBase, "block");
