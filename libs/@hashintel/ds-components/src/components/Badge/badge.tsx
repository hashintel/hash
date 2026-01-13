import type { ReactNode } from "react";

import { css, cva } from "../../../styled-system/css";

export interface BadgeProps {
  /** The content of the badge */
  children: ReactNode;
  /** The color scheme of the badge */
  colorScheme?:
    | "gray"
    | "brand"
    | "green"
    | "orange"
    | "red"
    | "purple"
    | "pink"
    | "yellow";
  /** The size of the badge */
  size?: "xs" | "sm" | "md" | "lg";
  /** Whether the badge is square (for numeric badges) */
  isSquare?: boolean;
  /** Optional icon to display on the left */
  iconLeft?: ReactNode;
  /** Optional icon to display on the right */
  iconRight?: ReactNode;
}

// Define recipe for badge styling variants
const badgeRecipe = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "medium",
    textAlign: "center",
    whiteSpace: "nowrap",
    userSelect: "none",
    overflow: "clip",
    paddingY: "default.0",
  },
  variants: {
    colorScheme: {
      gray: {
        backgroundColor: "gray.20",
        color: "gray.80",
      },
      brand: {
        backgroundColor: "blue.10",
        color: "blue.80",
      },
      green: {
        backgroundColor: "green.10",
        color: "green.80",
      },
      orange: {
        backgroundColor: "orange.10",
        color: "orange.80",
      },
      red: {
        backgroundColor: "red.00",
        color: "red.80",
      },
      purple: {
        backgroundColor: "purple.00",
        color: "purple.80",
      },
      pink: {
        backgroundColor: "pink.10",
        color: "pink.80",
      },
      yellow: {
        backgroundColor: "yellow.10",
        color: "yellow.80",
      },
    },
    size: {
      xs: {
        fontSize: "[9px]",
        lineHeight: "[12px]",
        gap: "default.3",
        height: "[14px]",
      },
      sm: {
        fontSize: "xs",
        lineHeight: "none.text-xs",
        gap: "default.3",
        height: "[16px]",
      },
      md: {
        fontSize: "sm",
        lineHeight: "none.text-sm",
        gap: "default.3",
        height: "[20px]",
      },
      lg: {
        fontSize: "base",
        lineHeight: "none.text-base",
        gap: "default.3",
        height: "[24px]",
      },
    },
    isSquare: {
      true: {},
      false: {},
    },
  },
  compoundVariants: [
    // Rounded badges - padding and border radius
    {
      isSquare: false,
      size: "xs",
      css: {
        paddingX: "default.3",
        borderRadius: "md.2",
      },
    },
    {
      isSquare: false,
      size: "sm",
      css: {
        paddingX: "default.3",
        borderRadius: "md.2",
      },
    },
    {
      isSquare: false,
      size: "md",
      css: {
        paddingX: "default.5",
        borderRadius: "md.3",
      },
    },
    {
      isSquare: false,
      size: "lg",
      css: {
        paddingX: "default.5",
        borderRadius: "md.3",
      },
    },
    // Square badges - fixed width and border radius
    {
      isSquare: true,
      size: "xs",
      css: {
        paddingX: "default.3",
        width: "[14px]",
        borderRadius: "md.2",
      },
    },
    {
      isSquare: true,
      size: "sm",
      css: {
        paddingX: "default.3",
        width: "[16px]",
        borderRadius: "md.2",
      },
    },
    {
      isSquare: true,
      size: "md",
      css: {
        paddingX: "default.0",
        width: "[20px]",
        borderRadius: "md.3",
      },
    },
    {
      isSquare: true,
      size: "lg",
      css: {
        paddingX: "default.5",
        width: "[24px]",
        borderRadius: "md.3",
      },
    },
  ],
  defaultVariants: {
    colorScheme: "gray",
    size: "xs",
    isSquare: false,
  },
});

export const Badge: React.FC<BadgeProps> = ({
  children,
  colorScheme = "gray",
  size = "xs",
  isSquare = false,
  iconLeft,
  iconRight,
}) => {
  return (
    <span className={badgeRecipe({ colorScheme, size, isSquare })}>
      {iconLeft && (
        <span
          className={css({
            display: "inline-flex",
            alignItems: "center",
            flexShrink: "0",
          })}
        >
          {iconLeft}
        </span>
      )}
      {children}
      {iconRight && (
        <span
          className={css({
            display: "inline-flex",
            alignItems: "center",
            flexShrink: "0",
          })}
        >
          {iconRight}
        </span>
      )}
    </span>
  );
};
