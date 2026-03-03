import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const buttonStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "[6px]",
    fontSize: "[12px]",
    padding: "[4px 8px]",
    border: "[1px solid rgba(0, 0, 0, 0.2)]",
    borderRadius: "[4px]",
    backgroundColor: "[white]",
    color: "[#333]",
    cursor: "pointer",
    transition: "[all 0.15s ease]",
    _hover: {
      backgroundColor: "[rgba(0, 0, 0, 0.05)]",
    },
    _active: {
      backgroundColor: "[rgba(0, 0, 0, 0.1)]",
    },
  },
  variants: {
    isDisabled: {
      true: {
        opacity: "[0.5]",
        cursor: "not-allowed",
        _hover: {
          backgroundColor: "[white]",
        },
      },
      false: {},
    },
    variant: {
      default: {},
      ghost: {
        border: "none",
        backgroundColor: "[transparent]",
        _hover: {
          backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        },
      },
    },
  },
  defaultVariants: {
    isDisabled: false,
    variant: "default",
  },
});

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Button variant */
  variant?: "default" | "ghost";
  /** Button content */
  children: React.ReactNode;
  /** Ref to the button element */
  ref?: React.Ref<HTMLButtonElement>;
};

const ButtonBase: React.FC<ButtonProps> = ({
  variant = "default",
  disabled,
  className,
  children,
  ref,
  ...props
}) => (
  <button
    ref={ref}
    type="button"
    disabled={disabled}
    className={`${buttonStyle({ isDisabled: disabled, variant })}${className ? ` ${className}` : ""}`}
    {...props}
  >
    {children}
  </button>
);

export const Button = withTooltip(ButtonBase, "block");
