import { css } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface BadgeProps {
  /** The content of the badge */
  children: ReactNode;
  /** The color scheme of the badge */
  colorScheme?: "gray" | "brand" | "green" | "orange" | "red" | "purple" | "pink" | "yellow";
  /** The size of the badge */
  size?: "xs" | "sm" | "md" | "lg";
  /** Whether the badge is square (for numeric badges) */
  isSquare?: boolean;
  /** Optional icon to display on the left */
  iconLeft?: ReactNode;
  /** Optional icon to display on the right */
  iconRight?: ReactNode;
}

const colorSchemeStyles = {
  gray: {
    backgroundColor: "gray.20",
    color: "gray.80",
  },
  brand: {
    backgroundColor: "blue.10",
    color: "blue.80",
  },
  green: {
    backgroundColor: "green.20",
    color: "green.80",
  },
  orange: {
    backgroundColor: "orange.20",
    color: "orange.80",
  },
  red: {
    backgroundColor: "red.20",
    color: "red.80",
  },
  purple: {
    backgroundColor: "purple.20",
    color: "purple.80",
  },
  pink: {
    backgroundColor: "pink.20",
    color: "pink.80",
  },
  yellow: {
    backgroundColor: "yellow.20",
    color: "yellow.80",
  },
} as const;

const sizeStyles = {
  xs: {
    fontSize: "[9px]",
    lineHeight: "[12px]",
    paddingX: "[4px]",
    paddingY: "[2px]",
    gap: "[4px]",
    minHeight: "[16px]",
  },
  sm: {
    fontSize: "[12px]",
    lineHeight: "[12px]",
    paddingX: "[6px]",
    paddingY: "[4px]",
    gap: "[4px]",
    minHeight: "[20px]",
  },
  md: {
    fontSize: "[14px]",
    lineHeight: "[14px]",
    paddingX: "[8px]",
    paddingY: "[5px]",
    gap: "[6px]",
    minHeight: "[24px]",
  },
  lg: {
    fontSize: "[16px]",
    lineHeight: "[16px]",
    paddingX: "[10px]",
    paddingY: "[6px]",
    gap: "[6px]",
    minHeight: "[28px]",
  },
} as const;

const squareSizeStyles = {
  xs: {
    width: "[16px]",
    height: "[16px]",
  },
  sm: {
    width: "[20px]",
    height: "[20px]",
  },
  md: {
    width: "[24px]",
    height: "[24px]",
  },
  lg: {
    width: "[28px]",
    height: "[28px]",
  },
} as const;

export const Badge: React.FC<BadgeProps> = ({
  children,
  colorScheme = "gray",
  size = "xs",
  isSquare = false,
  iconLeft,
  iconRight,
}) => {
  const colorStyles = colorSchemeStyles[colorScheme];
  const dimensionStyles = isSquare ? squareSizeStyles[size] : sizeStyles[size];

  return (
    <span
      className={css({
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "[4px]",
        fontWeight: "medium",
        textAlign: "center",
        whiteSpace: "nowrap",
        userSelect: "none",
        ...colorStyles,
        ...dimensionStyles,
      })}
    >
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
