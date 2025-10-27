import { css, cx } from "@hashintel/ds-helpers/css";
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
        css({
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "spacing.2",
          fontFamily: "[Inter, sans-serif]",
          fontWeight: "medium",
          borderRadius: "radius.6",
          lineHeight: "[14px]",
          cursor: "pointer",
          overflow: "hidden",
          paddingX: "spacing.5",
          paddingY: "spacing.4",
          fontSize: "size.textsm",
          _disabled: {
            cursor: "not-allowed",
            opacity: "[0.3]",
          },

          // Size variants
          "&[data-size='xs']": {
            height: "[24px]",
            paddingX: "spacing.5",
            paddingY: "spacing.4",
            fontSize: "size.textsm",
            gap: "spacing.1",
            borderRadius: "component.button.xs",
          },
          "&[data-size='sm']": {
            height: "[28px]",
            paddingX: "spacing.5",
            paddingY: "spacing.4",
            fontSize: "size.textsm",
            gap: "spacing.2",
            borderRadius: "component.button.sm",
          },
          "&[data-size='md']": {
            height: "[32px]",
            paddingX: "spacing.6",
            paddingY: "spacing.5",
            fontSize: "size.textsm",
            gap: "spacing.2",
            borderRadius: "component.button.md",
          },
          "&[data-size='lg']": {
            height: "[40px]",
            paddingX: "spacing.8",
            paddingY: "spacing.6",
            fontSize: "size.textbase",
            gap: "spacing.2",
            borderRadius: "component.button.lg",
          },

          // Primary variant styles
          "&[data-variant='primary'][data-color-scheme='brand']": {
            backgroundColor: "bg.brand.bold.default",
            color: "text.inverted",
            _hover: {
              backgroundColor: "bg.brand.bold.hover",
            },
            _active: {
              backgroundColor: "bg.brand.bold.active",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "core.custom.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='primary'][data-color-scheme='neutral']": {
            backgroundColor: "bg.neutral.bold.default",
            color: "text.inverted",
            _hover: {
              backgroundColor: "bg.neutral.bold.hover",
            },
            _active: {
              backgroundColor: "bg.neutral.bold.active",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "core.gray.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='primary'][data-color-scheme='critical']": {
            backgroundColor: "bg.status.critical.strong.default",
            color: "text.inverted",
            _hover: {
              backgroundColor: "bg.status.critical.strong.hover",
            },
            _active: {
              backgroundColor: "bg.status.critical.strong.active",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "core.red.30",
              outlineOffset: "[2px]",
            },
          },

          // Secondary variant styles
          "&[data-variant='secondary'][data-color-scheme='brand']": {
            backgroundColor: "bg.neutral.subtle.default",
            border: "[1px solid]",
            borderColor: "bg.brand.bold.default",
            color: "text.link",
            _hover: {
              backgroundColor: "bg.brand.subtle.hover",
              borderColor: "bg.brand.bold.hover",
              color: "text.linkhover",
            },
            _active: {
              backgroundColor: "bg.brand.subtle.active",
              borderColor: "bg.brand.bold.active",
              color: "text.linkhover",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "core.custom.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='secondary'][data-color-scheme='neutral']": {
            backgroundColor: "bg.neutral.subtle.default",
            border: "[1px solid]",
            borderColor: "border.neutral.default",
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
              outlineColor: "core.gray.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='secondary'][data-color-scheme='critical']": {
            backgroundColor: "bg.neutral.subtle.default",
            border: "[1px solid]",
            borderColor: "bg.status.critical.strong.default",
            color: "text.semantic.critical",
            _hover: {
              backgroundColor: "bg.status.critical.subtle.hover",
              borderColor: "bg.status.critical.strong.hover",
              color: "text.semantic.critical",
            },
            _active: {
              backgroundColor: "bg.status.critical.subtle.active",
              borderColor: "bg.status.critical.strong.active",
              color: "text.semantic.critical",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "core.red.30",
              outlineOffset: "[2px]",
            },
          },

          // Ghost variant styles
          "&[data-variant='ghost'][data-color-scheme='brand']": {
            backgroundColor: "[transparent]",
            color: "text.link",
            _hover: {
              backgroundColor: "bg.brand.subtle.hover",
              color: "text.linkhover",
            },
            _active: {
              backgroundColor: "bg.brand.subtle.active",
              color: "text.linkhover",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "core.custom.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='ghost'][data-color-scheme='neutral']": {
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
              outlineColor: "core.gray.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='ghost'][data-color-scheme='critical']": {
            backgroundColor: "[transparent]",
            color: "text.semantic.critical",
            _hover: {
              backgroundColor: "bg.status.critical.subtle.hover",
              color: "text.semantic.critical",
            },
            _active: {
              backgroundColor: "bg.status.critical.subtle.active",
              color: "text.semantic.critical",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "core.red.30",
              outlineOffset: "[2px]",
            },
          },

          // Loading state
          "&[data-loading='true']": {
            opacity: 0.4,
            pointerEvents: "none",
          },
        }),
        className
      )}
      data-variant={variant}
      data-color-scheme={colorScheme}
      data-size={size}
      data-loading={isLoading}
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
          gap: "spacing.2",
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
