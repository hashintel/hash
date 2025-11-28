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
    paddingY: "spacing.0",
  },
  variants: {
    colorScheme: {
      gray: {
        backgroundColor: "core.gray.20",
        color: "core.gray.80",
      },
      brand: {
        backgroundColor: "core.blue.10",
        color: "core.blue.80",
      },
      green: {
        backgroundColor: "core.green.10",
        color: "core.green.80",
      },
      orange: {
        backgroundColor: "core.orange.10",
        color: "core.orange.80",
      },
      red: {
        backgroundColor: "core.red.00",
        color: "core.red.80",
      },
      purple: {
        backgroundColor: "core.purple.00",
        color: "core.purple.80",
      },
      pink: {
        backgroundColor: "core.pink.10",
        color: "core.pink.80",
      },
      yellow: {
        backgroundColor: "core.yellow.10",
        color: "core.yellow.80",
      },
    },
    size: {
      xs: {
        fontSize: "[9px]",
        lineHeight: "[12px]",
        gap: "spacing.3",
        height: "[14px]",
      },
      sm: {
        fontSize: "size.textxs",
        lineHeight: "leading.none.textxs",
        gap: "spacing.3",
        height: "[16px]",
      },
      md: {
        fontSize: "size.textsm",
        lineHeight: "leading.none.textsm",
        gap: "spacing.3",
        height: "[20px]",
      },
      lg: {
        fontSize: "size.textbase",
        lineHeight: "leading.none.textbase",
        gap: "spacing.3",
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
        paddingX: "spacing.3",
        borderRadius: "radius.2",
      },
    },
    {
      isSquare: false,
      size: "sm",
      css: {
        paddingX: "spacing.3",
        borderRadius: "radius.2",
      },
    },
    {
      isSquare: false,
      size: "md",
      css: {
        paddingX: "spacing.5",
        borderRadius: "radius.3",
      },
    },
    {
      isSquare: false,
      size: "lg",
      css: {
        paddingX: "spacing.5",
        borderRadius: "radius.3",
      },
    },
    // Square badges - fixed width and border radius
    {
      isSquare: true,
      size: "xs",
      css: {
        paddingX: "spacing.3",
        width: "[14px]",
        borderRadius: "radius.2",
      },
    },
    {
      isSquare: true,
      size: "sm",
      css: {
        paddingX: "spacing.3",
        width: "[16px]",
        borderRadius: "radius.2",
      },
    },
    {
      isSquare: true,
      size: "md",
      css: {
        paddingX: "spacing.0",
        width: "[20px]",
        borderRadius: "radius.3",
      },
    },
    {
      isSquare: true,
      size: "lg",
      css: {
        paddingX: "spacing.5",
        width: "[24px]",
        borderRadius: "radius.3",
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
