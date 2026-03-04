import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const inputStyle = cva({
  base: {
    boxSizing: "border-box",
    width: "[100%]",
    backgroundColor: "[white]",
    border: "[1px solid rgba(0, 0, 0, 0.09)]",
    fontWeight: "[500]",
    color: "[#484848]",
    outline: "none",
    transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
    _hover: {
      borderColor: "[rgba(0, 0, 0, 0.12)]",
    },
    _focus: {
      borderColor: "[rgba(0, 0, 0, 0.09)]",
      boxShadow: "[0px 0px 0px 2px rgba(0, 0, 0, 0.04)]",
    },
    _active: {
      borderColor: "[rgba(0, 0, 0, 0.06)]",
      boxShadow: "[inset 0px 2px 1px rgba(0, 0, 0, 0.05)]",
    },
    _disabled: {
      backgroundColor: "[#fcfcfc]",
      opacity: "[0.7]",
      cursor: "not-allowed",
      color: "[#8d8d8d]",
      _hover: {
        borderColor: "[rgba(0, 0, 0, 0.09)]",
      },
    },
    _placeholder: {
      color: "[#bbb]",
    },
  },
  variants: {
    size: {
      xs: {
        height: "[24px]",
        fontSize: "[12px]",
        borderRadius: "[6px]",
        paddingX: "[6px]",
      },
      sm: {
        height: "[28px]",
        fontSize: "[14px]",
        borderRadius: "[8px]",
        paddingX: "[8px]",
      },
      md: {
        height: "[32px]",
        fontSize: "[14px]",
        borderRadius: "[10px]",
        paddingX: "[10px]",
      },
      lg: {
        height: "[40px]",
        fontSize: "[16px]",
        borderRadius: "[12px]",
        paddingX: "[12px]",
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
        borderColor: "[rgba(255, 0, 0, 0.3)]",
        _focus: {
          borderColor: "[rgba(255, 0, 0, 0.3)]",
          boxShadow: "[0px 0px 0px 2px rgba(233, 53, 53, 0.06)]",
        },
      },
      false: {},
    },
  },
  defaultVariants: {
    size: "sm",
    isMonospace: false,
    hasError: false,
  },
});

type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg";
  /** Whether to use monospace font */
  monospace?: boolean;
  /** Whether the input has an error */
  hasError?: boolean;
  /** Ref to the input element */
  ref?: React.Ref<HTMLInputElement>;
};

const InputBase: React.FC<InputProps> = ({
  size = "sm",
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
    className={`${inputStyle({ size, isMonospace: monospace, hasError })}${className ? ` ${className}` : ""}`}
    {...props}
  />
);

export const Input = withTooltip(InputBase, "block");
