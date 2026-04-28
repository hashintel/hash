import { css, cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

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
    paddingY: "2",
  },
  variants: {
    colorScheme: {
      gray: {
        backgroundColor: "neutral.s20",
        color: "neutral.s80",
      },
      brand: {
        backgroundColor: "blue.s10",
        color: "blue.s80",
      },
      green: {
        backgroundColor: "green.s10",
        color: "green.s80",
      },
      orange: {
        backgroundColor: "orange.s10",
        color: "orange.s80",
      },
      red: {
        backgroundColor: "red.s00",
        color: "red.s80",
      },
      purple: {
        backgroundColor: "purple.s00",
        color: "purple.s80",
      },
      pink: {
        backgroundColor: "pink.s10",
        color: "pink.s80",
      },
      yellow: {
        backgroundColor: "yellow.s10",
        color: "yellow.s80",
      },
    },
    size: {
      xs: {
        fontSize: "[9px]",
        lineHeight: "[12px]",
        gap: "3",
        height: "[14px]",
      },
      sm: {
        fontSize: "xs",
        lineHeight: "none",
        gap: "3",
        height: "[16px]",
      },
      md: {
        fontSize: "sm",
        lineHeight: "none",
        gap: "3",
        height: "[20px]",
      },
      lg: {
        fontSize: "base",
        lineHeight: "none",
        gap: "3",
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
        paddingX: "3",
        borderRadius: "sm",
      },
    },
    {
      isSquare: false,
      size: "sm",
      css: {
        paddingX: "3",
        borderRadius: "sm",
      },
    },
    {
      isSquare: false,
      size: "md",
      css: {
        paddingX: "4",
        borderRadius: "md",
      },
    },
    {
      isSquare: false,
      size: "lg",
      css: {
        paddingX: "4",
        borderRadius: "md",
      },
    },
    // Square badges - fixed width and border radius
    {
      isSquare: true,
      size: "xs",
      css: {
        paddingX: "3",
        width: "[14px]",
        borderRadius: "sm",
      },
    },
    {
      isSquare: true,
      size: "sm",
      css: {
        paddingX: "3",
        width: "[16px]",
        borderRadius: "sm",
      },
    },
    {
      isSquare: true,
      size: "md",
      css: {
        paddingX: "4",
        width: "[20px]",
        borderRadius: "md",
      },
    },
    {
      isSquare: true,
      size: "lg",
      css: {
        paddingX: "4",
        width: "[24px]",
        borderRadius: "md",
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
