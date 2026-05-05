import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const numberInputStyle = cva({
  base: {
    boxSizing: "border-box",
    width: "[100%]",
    backgroundColor: "neutral.s00",
    borderWidth: "[1px]",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    fontWeight: "medium",
    color: "neutral.fg.body",
    outline: "none",
    transition: "[border-color 0.15s ease, box-shadow 0.15s ease]",
    appearance: "[textfield]",
    "&::-webkit-inner-spin-button": {
      display: "none",
    },
    "&::-webkit-outer-spin-button": {
      display: "none",
    },
    _hover: {
      borderColor: "neutral.bd.subtle.hover",
    },
    _focus: {
      borderColor: "neutral.bd.subtle",
      boxShadow: "[0px 0px 0px 2px {colors.neutral.a25}]",
    },
    _active: {
      borderColor: "neutral.bd.subtle.active",
      boxShadow: "[inset 0px 2px 1px rgba(0, 0, 0, 0.05)]",
    },
    _disabled: {
      backgroundColor: "neutral.s10",
      opacity: "[0.7]",
      cursor: "not-allowed",
      _hover: {
        borderColor: "neutral.bd.subtle",
      },
    },
    _placeholder: {
      color: "neutral.s80",
    },
  },
  variants: {
    size: {
      xs: {
        height: "[24px]",
        fontSize: "xs",
        borderRadius: "md",
        paddingX: "1.5",
      },
      sm: {
        height: "[28px]",
        fontSize: "sm",
        borderRadius: "lg",
        paddingX: "2",
      },
      md: {
        height: "[32px]",
        fontSize: "sm",
        borderRadius: "xl",
        paddingX: "2.5",
      },
      lg: {
        height: "[40px]",
        fontSize: "base",
        borderRadius: "xl",
        paddingX: "3",
      },
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
    hasError: false,
  },
});

type NumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> & {
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg";
  /** Whether the input has an error */
  hasError?: boolean;
  /** Ref to the input element */
  ref?: React.Ref<HTMLInputElement>;
};

const NumberInputBase: React.FC<NumberInputProps> = ({
  size = "sm",
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
    className={`${numberInputStyle({ size, hasError })}${className ? ` ${className}` : ""}`}
    {...props}
  />
);

export const NumberInput = withTooltip(NumberInputBase, "block");
