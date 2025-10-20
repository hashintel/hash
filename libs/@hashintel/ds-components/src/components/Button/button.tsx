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
          gap: "1",
          fontFamily: "body",
          fontWeight: "medium",
          borderRadius: "radius.6",
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
            paddingX: "2",
            paddingY: "1",
            fontSize: "sm",
            gap: "1",
          },
          "&[data-size='sm']": {
            height: "[28px]",
            paddingX: "2.5",
            paddingY: "1.5",
            fontSize: "sm",
            gap: "1",
          },
          "&[data-size='md']": {
            height: "[32px]",
            paddingX: "2.5",
            paddingY: "2",
            fontSize: "sm",
            gap: "1",
          },
          "&[data-size='lg']": {
            height: "[40px]",
            paddingX: "4",
            paddingY: "2.5",
            fontSize: "base",
            gap: "1.5",
          },

          // Primary variant styles
          "&[data-variant='primary'][data-color-scheme='brand']": {
            backgroundColor: "custom.50",
            color: "neutral.white",
            _hover: {
              backgroundColor: "custom.70",
            },
            _active: {
              backgroundColor: "custom.80",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "custom.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='primary'][data-color-scheme='neutral']": {
            backgroundColor: "gray.80",
            color: "neutral.white",
            _hover: {
              backgroundColor: "gray.90",
            },
            _active: {
              backgroundColor: "gray.95",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "gray.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='primary'][data-color-scheme='critical']": {
            backgroundColor: "red.50",
            color: "neutral.white",
            _hover: {
              backgroundColor: "red.60",
            },
            _active: {
              backgroundColor: "red.70",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "red.30",
              outlineOffset: "[2px]",
            },
          },

          // Secondary variant styles
          "&[data-variant='secondary'][data-color-scheme='brand']": {
            backgroundColor: "neutral.white",
            border: "[1px solid]",
            borderColor: "custom.50",
            color: "custom.50",
            _hover: {
              backgroundColor: "custom.0",
              borderColor: "custom.70",
              color: "custom.70",
            },
            _active: {
              backgroundColor: "custom.10",
              borderColor: "custom.80",
              color: "custom.80",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "custom.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='secondary'][data-color-scheme='neutral']": {
            backgroundColor: "neutral.white",
            border: "[1px solid]",
            borderColor: "gray.20",
            color: "gray.70",
            _hover: {
              backgroundColor: "gray.0",
              borderColor: "gray.30",
            },
            _active: {
              backgroundColor: "gray.10",
              borderColor: "gray.40",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "gray.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='secondary'][data-color-scheme='critical']": {
            backgroundColor: "neutral.white",
            border: "[1px solid]",
            borderColor: "red.50",
            color: "red.50",
            _hover: {
              backgroundColor: "red.0",
              borderColor: "red.60",
              color: "red.60",
            },
            _active: {
              backgroundColor: "red.10",
              borderColor: "red.70",
              color: "red.70",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "red.30",
              outlineOffset: "[2px]",
            },
          },

          // Ghost variant styles
          "&[data-variant='ghost'][data-color-scheme='brand']": {
            backgroundColor: "[transparent]",
            color: "custom.50",
            _hover: {
              backgroundColor: "custom.0",
              color: "custom.70",
            },
            _active: {
              backgroundColor: "custom.10",
              color: "custom.80",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "custom.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='ghost'][data-color-scheme='neutral']": {
            backgroundColor: "[transparent]",
            color: "gray.60",
            _hover: {
              backgroundColor: "gray.0",
              color: "gray.80",
            },
            _active: {
              backgroundColor: "gray.10",
              color: "gray.90",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "gray.30",
              outlineOffset: "[2px]",
            },
          },
          "&[data-variant='ghost'][data-color-scheme='critical']": {
            backgroundColor: "[transparent]",
            color: "red.50",
            _hover: {
              backgroundColor: "red.0",
              color: "red.60",
            },
            _active: {
              backgroundColor: "red.10",
              color: "red.70",
            },
            _focusVisible: {
              outline: "[2px solid]",
              outlineColor: "red.30",
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
          gap: "2",
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
