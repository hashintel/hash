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
        fontWeight: "medium",
        textAlign: "center",
        whiteSpace: "nowrap",
        userSelect: "none",
        overflow: "clip",

        // Color schemes - using design tokens from Figma
        "&[data-color-scheme='gray']": {
          backgroundColor: "core.gray.20",
          color: "core.gray.80",
        },
        "&[data-color-scheme='brand']": {
          backgroundColor: "core.blue.10",
          color: "core.blue.80",
        },
        "&[data-color-scheme='green']": {
          backgroundColor: "core.green.10",
          color: "core.green.80",
        },
        "&[data-color-scheme='orange']": {
          backgroundColor: "core.orange.10",
          color: "core.orange.80",
        },
        "&[data-color-scheme='red']": {
          backgroundColor: "core.red.00",
          color: "core.red.80",
        },
        "&[data-color-scheme='purple']": {
          backgroundColor: "core.purple.00",
          color: "core.purple.80",
        },
        "&[data-color-scheme='pink']": {
          backgroundColor: "core.pink.10",
          color: "core.pink.80",
        },
        "&[data-color-scheme='yellow']": {
          backgroundColor: "core.yellow.10",
          color: "core.yellow.80",
        },

        // Sizes - rounded badges (based on Figma specs)
        "&[data-square='false'][data-size='xs']": {
          fontSize: "[9px]",
          lineHeight: "[12px]",
          paddingX: "spacing.3", // 4px
          paddingY: "spacing.0", // 0px
          gap: "spacing.3", // 4px
          height: "[14px]",
          borderRadius: "radius.2", // 4px
        },
        "&[data-square='false'][data-size='sm']": {
          fontSize: "size.textxs", // 12px
          lineHeight: "leading.none.textxs", // 12px
          paddingX: "spacing.3", // 4px
          paddingY: "spacing.0", // 0px
          gap: "spacing.3", // 4px
          height: "[16px]",
          borderRadius: "radius.2", // 4px
        },
        "&[data-square='false'][data-size='md']": {
          fontSize: "size.textsm", // 14px
          lineHeight: "leading.none.textsm", // 14px
          paddingX: "spacing.5", // 8px
          paddingY: "spacing.0", // 0px
          gap: "spacing.3", // 4px
          height: "[20px]",
          borderRadius: "radius.3", // 6px
        },
        "&[data-square='false'][data-size='lg']": {
          fontSize: "size.textbase", // 16px
          lineHeight: "leading.none.textbase", // 16px
          paddingX: "spacing.5", // 8px
          paddingY: "spacing.0", // 0px
          gap: "spacing.3", // 4px
          height: "[24px]",
          borderRadius: "radius.3", // 6px
        },

        // Sizes - square badges (based on Figma specs)
        "&[data-square='true'][data-size='xs']": {
          fontSize: "[9px]",
          lineHeight: "[12px]",
          paddingX: "spacing.3", // 4px
          paddingY: "spacing.0", // 0px
          width: "[14px]",
          height: "[14px]",
          borderRadius: "radius.2", // 4px
        },
        "&[data-square='true'][data-size='sm']": {
          fontSize: "size.textxs", // 12px
          lineHeight: "leading.none.textxs", // 12px
          paddingX: "spacing.3", // 4px
          paddingY: "spacing.0", // 0px
          width: "[16px]",
          height: "[16px]",
          borderRadius: "radius.2", // 4px
        },
        "&[data-square='true'][data-size='md']": {
          fontSize: "size.textsm", // 14px
          lineHeight: "leading.none.textsm", // 14px
          paddingX: "spacing.0", // 0px
          paddingY: "spacing.0", // 0px
          width: "[20px]",
          height: "[20px]",
          borderRadius: "radius.3", // 6px
        },
        "&[data-square='true'][data-size='lg']": {
          fontSize: "size.textbase", // 16px
          lineHeight: "leading.none.textbase", // 16px
          paddingX: "spacing.5", // 8px
          paddingY: "spacing.0", // 0px
          width: "[24px]",
          height: "[24px]",
          borderRadius: "radius.3", // 6px
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
