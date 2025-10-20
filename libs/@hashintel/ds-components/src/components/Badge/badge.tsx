import { css } from "@hashintel/ds-helpers/css";
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

export const Badge: React.FC<BadgeProps> = ({
  children,
  colorScheme = "gray",
  size = "xs",
  isSquare = false,
  iconLeft,
  iconRight,
}) => {
  return (
    <span
      data-color-scheme={colorScheme}
      data-size={size}
      data-square={isSquare}
      className={css({
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "[4px]",
        fontWeight: "medium",
        textAlign: "center",
        whiteSpace: "nowrap",
        userSelect: "none",

        // Color schemes
        "&[data-color-scheme='gray']": {
          backgroundColor: "gray.20",
          color: "gray.80",
        },
        "&[data-color-scheme='brand']": {
          backgroundColor: "blue.10",
          color: "blue.80",
        },
        "&[data-color-scheme='green']": {
          backgroundColor: "green.20",
          color: "green.80",
        },
        "&[data-color-scheme='orange']": {
          backgroundColor: "orange.20",
          color: "orange.80",
        },
        "&[data-color-scheme='red']": {
          backgroundColor: "red.20",
          color: "red.80",
        },
        "&[data-color-scheme='purple']": {
          backgroundColor: "purple.20",
          color: "purple.80",
        },
        "&[data-color-scheme='pink']": {
          backgroundColor: "pink.20",
          color: "pink.80",
        },
        "&[data-color-scheme='yellow']": {
          backgroundColor: "yellow.20",
          color: "yellow.80",
        },

        // Sizes - rounded badges
        "&[data-square='false'][data-size='xs']": {
          fontSize: "[9px]",
          lineHeight: "[12px]",
          paddingX: "[4px]",
          paddingY: "[2px]",
          gap: "[4px]",
          minHeight: "[16px]",
        },
        "&[data-square='false'][data-size='sm']": {
          fontSize: "[12px]",
          lineHeight: "[12px]",
          paddingX: "[6px]",
          paddingY: "[4px]",
          gap: "[4px]",
          minHeight: "[20px]",
        },
        "&[data-square='false'][data-size='md']": {
          fontSize: "[14px]",
          lineHeight: "[14px]",
          paddingX: "[8px]",
          paddingY: "[5px]",
          gap: "[6px]",
          minHeight: "[24px]",
        },
        "&[data-square='false'][data-size='lg']": {
          fontSize: "[16px]",
          lineHeight: "[16px]",
          paddingX: "[10px]",
          paddingY: "[6px]",
          gap: "[6px]",
          minHeight: "[28px]",
        },

        // Sizes - square badges
        "&[data-square='true'][data-size='xs']": {
          fontSize: "[9px]",
          lineHeight: "[12px]",
          width: "[16px]",
          height: "[16px]",
          padding: "0",
        },
        "&[data-square='true'][data-size='sm']": {
          fontSize: "[12px]",
          lineHeight: "[12px]",
          width: "[20px]",
          height: "[20px]",
          padding: "0",
        },
        "&[data-square='true'][data-size='md']": {
          fontSize: "[14px]",
          lineHeight: "[14px]",
          width: "[24px]",
          height: "[24px]",
          padding: "0",
        },
        "&[data-square='true'][data-size='lg']": {
          fontSize: "[16px]",
          lineHeight: "[16px]",
          width: "[28px]",
          height: "[28px]",
          padding: "0",
        },
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
