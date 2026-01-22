import { css, cva, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  /** The variant style of the button */
  variant?: "primary" | "secondary" | "ghost";
  /** The color scheme of the button */
  colorScheme?: "brand" | "neutral" | "critical";
  /** The size of the button */
  size?: "xs" | "sm" | "md" | "lg";
  /** Whether the button is in a loading state */
  isLoading?: boolean;
  /** Optional icon to display on the left */
  iconLeft?: ReactNode;
  /** Optional icon to display on the right */
  iconRight?: ReactNode;
  /** Button type */
  type?: "button" | "submit" | "reset";
}

const LoadingSpinner = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={css({
      animation: "spin 1s linear infinite",
    })}
  >
    <path
      d="M8 1.5V4.5M8 11.5V14.5M14.5 8H11.5M4.5 8H1.5M12.803 12.803L10.682 10.682M5.318 5.318L3.197 3.197M12.803 3.197L10.682 5.318M5.318 10.682L3.197 12.803"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Define recipe for button styling variants
const buttonRecipe = cva({
  base: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "[Inter, sans-serif]",
    fontWeight: "medium",
    lineHeight: "[14px]",
    cursor: "pointer",
    overflow: "hidden",
    _disabled: {
      cursor: "not-allowed",
      opacity: "[0.3]",
    },
  },
  variants: {
    variant: {
      primary: {},
      secondary: {},
      ghost: {},
    },
    colorScheme: {
      brand: {},
      neutral: {},
      critical: {},
    },
    size: {
      xs: {
        height: "[24px]",
        paddingX: "5",
        paddingY: "5",
        fontSize: "sm",
        gap: "3",
        borderRadius: "component.button.xs",
      },
      sm: {
        height: "[28px]",
        paddingX: "5",
        paddingY: "5",
        fontSize: "sm",
        gap: "3",
        borderRadius: "component.button.sm",
      },
      md: {
        height: "[32px]",
        paddingX: "6",
        paddingY: "6",
        fontSize: "sm",
        gap: "4",
        borderRadius: "component.button.md",
      },
      lg: {
        height: "[40px]",
        paddingX: "7",
        paddingY: "7",
        fontSize: "base",
        gap: "4",
        borderRadius: "component.button.lg",
      },
    },
    isLoading: {
      true: {
        opacity: 0.4,
        pointerEvents: "none",
      },
      false: {},
    },
  },
  compoundVariants: [
    // Primary + Brand
    {
      variant: "primary",
      colorScheme: "brand",
      css: {
        backgroundColor: "bg.accent.bold",
        color: "text.inverted",
        _hover: {
          backgroundColor: "bg.accent.bold.hover",
        },
        _active: {
          backgroundColor: "bg.accent.bold.active",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "accent.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Primary + Neutral
    {
      variant: "primary",
      colorScheme: "neutral",
      css: {
        backgroundColor: "bg.neutral.bold",
        color: "text.inverted",
        _hover: {
          backgroundColor: "bg.neutral.bold.hover",
        },
        _active: {
          backgroundColor: "bg.neutral.bold.active",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "gray.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Primary + Critical
    {
      variant: "primary",
      colorScheme: "critical",
      css: {
        backgroundColor: "bg.status.critical.strong",
        color: "text.inverted",
        _hover: {
          backgroundColor: "bg.status.critical.strong.hover",
        },
        _active: {
          backgroundColor: "bg.status.critical.strong.active",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "red.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Secondary + Brand
    {
      variant: "secondary",
      colorScheme: "brand",
      css: {
        backgroundColor: "bg.neutral.subtle",
        border: "[1px solid]",
        borderColor: "bg.accent.bold",
        color: "text.link",
        _hover: {
          backgroundColor: "bg.accent.subtle.hover",
          borderColor: "bg.accent.bold.hover",
          color: "text.linkHover",
        },
        _active: {
          backgroundColor: "bg.accent.subtle.active",
          borderColor: "bg.accent.bold.active",
          color: "text.linkHover",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "accent.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Secondary + Neutral
    {
      variant: "secondary",
      colorScheme: "neutral",
      css: {
        backgroundColor: "bg.neutral.subtle",
        border: "[1px solid]",
        borderColor: "border.neutral",
        color: "text.secondary",
        _hover: {
          backgroundColor: "bg.neutral.subtle.hover",
          borderColor: "border.neutral.hover",
        },
        _active: {
          backgroundColor: "bg.neutral.subtle.active",
          borderColor: "border.neutral.hover",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "gray.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Secondary + Critical
    {
      variant: "secondary",
      colorScheme: "critical",
      css: {
        backgroundColor: "bg.neutral.subtle",
        border: "[1px solid]",
        borderColor: "bg.status.critical.strong",
        color: "text.status.critical",
        _hover: {
          backgroundColor: "bg.status.critical.subtle.hover",
          borderColor: "bg.status.critical.strong.hover",
          color: "text.status.critical",
        },
        _active: {
          backgroundColor: "bg.status.critical.subtle.active",
          borderColor: "bg.status.critical.strong.active",
          color: "text.status.critical",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "red.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Ghost + Brand
    {
      variant: "ghost",
      colorScheme: "brand",
      css: {
        backgroundColor: "[transparent]",
        color: "text.link",
        _hover: {
          backgroundColor: "bg.accent.subtle.hover",
          color: "text.linkHover",
        },
        _active: {
          backgroundColor: "bg.accent.subtle.active",
          color: "text.linkHover",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "accent.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Ghost + Neutral
    {
      variant: "ghost",
      colorScheme: "neutral",
      css: {
        backgroundColor: "[transparent]",
        color: "text.tertiary",
        _hover: {
          backgroundColor: "bg.neutral.subtle.hover",
          color: "text.primary",
        },
        _active: {
          backgroundColor: "bg.neutral.subtle.active",
          color: "text.primary",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "gray.30",
          outlineOffset: "[2px]",
        },
      },
    },
    // Ghost + Critical
    {
      variant: "ghost",
      colorScheme: "critical",
      css: {
        backgroundColor: "[transparent]",
        color: "text.status.critical",
        _hover: {
          backgroundColor: "bg.status.critical.subtle.hover",
          color: "text.status.critical",
        },
        _active: {
          backgroundColor: "bg.status.critical.subtle.active",
          color: "text.status.critical",
        },
        _focusVisible: {
          outline: "[2px solid]",
          outlineColor: "red.30",
          outlineOffset: "[2px]",
        },
      },
    },
  ],
  defaultVariants: {
    variant: "primary",
    colorScheme: "brand",
    size: "md",
    isLoading: false,
  },
});

export const Button: React.FC<ButtonProps> = ({
  className,
  children,
  variant = "primary",
  colorScheme = "brand",
  size = "md",
  isLoading = false,
  iconLeft,
  iconRight,
  disabled,
  ...props
}) => {
  const isDisabled = disabled ?? isLoading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      className={cx(
        buttonRecipe({ variant, colorScheme, size, isLoading }),
        className,
      )}
      {...props}
    >
      {isLoading && (
        <span
          className={css({
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <LoadingSpinner />
        </span>
      )}
      <span
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "4",
          opacity: isLoading ? 0 : 1,
        })}
      >
        {iconLeft && <span>{iconLeft}</span>}
        {children}
        {iconRight && <span>{iconRight}</span>}
      </span>
    </button>
  );
};
