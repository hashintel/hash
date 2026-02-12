import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

const iconButtonStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    border: "none",
    background: "[transparent]",
    borderRadius: "md",
    cursor: "pointer",
    transition: "[all 0.15s ease]",
  },
  variants: {
    size: {
      sm: {
        width: "[20px]",
        height: "[20px]",
        fontSize: "[14px]",
      },
      md: {
        width: "[24px]",
        height: "[24px]",
        fontSize: "[16px]",
      },
      lg: {
        width: "[32px]",
        height: "[32px]",
        fontSize: "[20px]",
      },
    },
    variant: {
      default: {
        color: "neutral.s60",
        _hover: {
          color: "neutral.s80",
          backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        },
      },
      danger: {
        color: "neutral.s60",
        _hover: {
          color: "red.s60",
          backgroundColor: "red.s10",
        },
      },
    },
    isDisabled: {
      true: {
        opacity: "[0.5]",
        cursor: "not-allowed",
        _hover: {
          color: "neutral.s60",
          backgroundColor: "[transparent]",
        },
      },
      false: {},
    },
  },
  defaultVariants: {
    size: "md",
    variant: "default",
    isDisabled: false,
  },
  compoundVariants: [
    {
      variant: "danger",
      isDisabled: true,
      css: {
        _hover: {
          color: "neutral.s60",
          backgroundColor: "[transparent]",
        },
      },
    },
  ],
});

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Style variant */
  variant?: "default" | "danger";
  /** Icon content */
  children: React.ReactNode;
  /** Accessibility label (required for icon-only buttons) */
  "aria-label": string;
  /** Ref to the button element */
  ref?: React.Ref<HTMLButtonElement>;
};

const IconButtonBase: React.FC<IconButtonProps> = ({
  size = "md",
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
    className={`${iconButtonStyle({ size, variant, isDisabled: disabled })}${className ? ` ${className}` : ""}`}
    {...props}
  >
    {children}
  </button>
);

export const IconButton = withTooltip(IconButtonBase, "inline");
