import { cva } from "@hashintel/ds-helpers/css";

import { withTooltip } from "./hoc/with-tooltip";

// -- Styles (Figma: IconButton component) -------------------------------------

const iconButtonStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    border: "none",
    background: "[transparent]",
    cursor: "pointer",
    transition: "[all 0.15s ease]",
    fontSize: "base",
    overflow: "clip",
  },
  variants: {
    size: {
      xxs: {
        width: "[20px]",
        height: "[20px]",
        borderRadius: "md",
      },
      xs: {
        width: "[24px]",
        height: "[24px]",
        borderRadius: "lg",
      },
      sm: {
        width: "[28px]",
        height: "[28px]",
        borderRadius: "lg",
      },
      md: {
        width: "[32px]",
        height: "[32px]",
        borderRadius: "xl",
      },
      lg: {
        width: "[40px]",
        height: "[40px]",
        borderRadius: "xl",
      },
    },
    variant: {
      ghost: {
        color: "neutral.s105",
        _hover: {
          backgroundColor: "neutral.bg.subtle.hover",
          borderWidth: "[1px]",
          borderStyle: "solid",
          borderColor: "neutral.bd.subtle",
          boxShadow:
            "[0px 1px 2px 0px rgba(0, 0, 0, 0.12), 0px 0px 0px 0px rgba(0, 0, 0, 0.06)]",
        },
        _active: {
          backgroundColor: "neutral.bg.subtle",
          boxShadow: "[inset 0px 2px 1px 0px rgba(0, 0, 0, 0.05)]",
        },
        _focusVisible: {
          boxShadow: "[0px 0px 0px 2px {colors.neutral.a30}]",
          outline: "none",
        },
      },
      outline: {
        backgroundColor: "neutral.bg.subtle",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "neutral.bd.subtle",
        color: "neutral.s105",
        _hover: {
          backgroundColor: "neutral.bg.subtle.hover",
          boxShadow:
            "[0px 1px 2px 0px rgba(0, 0, 0, 0.12), 0px 0px 0px 1px rgba(0, 0, 0, 0.06)]",
        },
        _active: {
          boxShadow: "[inset 0px 2px 1px 0px rgba(0, 0, 0, 0.05)]",
        },
        _focusVisible: {
          boxShadow: "[0px 0px 0px 2px {colors.neutral.a30}]",
          outline: "none",
        },
      },
      subtle: {
        backgroundColor: "neutral.bg.subtle.hover",
        color: "neutral.s105",
        _hover: {
          borderWidth: "[1px]",
          borderStyle: "solid",
          borderColor: "neutral.bd.subtle",
          boxShadow:
            "[0px 1px 2px 0px rgba(0, 0, 0, 0.12), 0px 0px 0px 0px rgba(0, 0, 0, 0.06)]",
        },
        _active: {
          boxShadow: "[inset 0px 2px 1px 0px rgba(0, 0, 0, 0.05)]",
        },
        _focusVisible: {
          boxShadow: "[0px 0px 0px 2px {colors.neutral.a30}]",
          outline: "none",
        },
      },
      solid: {
        backgroundColor: "neutral.s120",
        color: "neutral.s00",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "neutral.s125",
        _hover: {
          backgroundColor: "neutral.s115",
        },
        _active: {
          boxShadow: "[inset 0px 2px 1px 0px rgba(0, 0, 0, 0.2)]",
        },
        _focusVisible: {
          boxShadow: "[0px 0px 0px 2px {colors.neutral.a30}]",
          outline: "none",
        },
      },
    },
    colorScheme: {
      gray: {},
      brand: {},
      red: {},
    },
    isDisabled: {
      true: {
        opacity: "[0.4]",
        cursor: "not-allowed",
        pointerEvents: "none",
      },
      false: {},
    },
  },
  compoundVariants: [
    // brand + solid
    {
      variant: "solid",
      colorScheme: "brand",
      css: {
        backgroundColor: "blue.s90",
        borderColor: "blue.s110",
        color: "neutral.s00",
        boxShadow:
          "[inset 0px -3px 2px 0px rgba(0, 0, 0, 0.1), inset 0px 2px 0.4px 0px rgba(255, 255, 255, 0.14), 0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 2px 3px 0px rgba(0, 0, 0, 0.08)]",
        _hover: {
          backgroundColor: "blue.s100",
        },
      },
    },
    // red + outline
    {
      variant: "outline",
      colorScheme: "red",
      css: {
        borderColor: "neutral.a30",
        color: "red.s90",
        boxShadow:
          "[0px 2px 3px 0px rgba(0, 0, 0, 0.03), 0px 2px 2px -1px rgba(0, 0, 0, 0.03)]",
        _hover: {
          backgroundColor: "red.bg.subtle.hover",
          borderColor: "red.bd.subtle",
        },
      },
    },
    // red + ghost
    {
      variant: "ghost",
      colorScheme: "red",
      css: {
        color: "neutral.s105",
        _hover: {
          color: "red.s90",
          backgroundColor: "red.bg.subtle.hover",
          borderColor: "red.bd.subtle",
        },
      },
    },
  ],
  defaultVariants: {
    size: "sm",
    variant: "ghost",
    colorScheme: "gray",
    isDisabled: false,
  },
});

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Size variant: xxs=20px, xs=24px, sm=28px (default), md=32px, lg=40px */
  size?: "xxs" | "xs" | "sm" | "md" | "lg";
  /** Style variant */
  variant?: "ghost" | "outline" | "subtle" | "solid";
  /** Color scheme */
  colorScheme?: "gray" | "brand" | "red";
  /** Icon content */
  children: React.ReactNode;
  /** Accessibility label (required for icon-only buttons) */
  "aria-label": string;
  /** Ref to the button element */
  ref?: React.Ref<HTMLButtonElement>;
};

const IconButtonBase: React.FC<IconButtonProps> = ({
  size = "sm",
  variant = "ghost",
  colorScheme = "gray",
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
    className={`${iconButtonStyle({ size, variant, colorScheme, isDisabled: disabled })}${className ? ` ${className}` : ""}`}
    {...props}
  >
    {children}
  </button>
);

export const IconButton = withTooltip(IconButtonBase, "inline");
