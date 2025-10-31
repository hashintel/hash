import { css, cx } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "tertiary";
  size?: "small" | "xs";
  children: ReactNode;
}

export const Button = ({
  variant = "primary",
  size = "small",
  className,
  children,
  ...props
}: ButtonProps) => {
  return (
    <button
      type="button"
      className={cx(
        css({
          position: "relative",
          fontWeight: "medium",
          borderRadius: "radius.6",
          cursor: "pointer",
          overflow: "hidden",
          border: "none",
          transition: "[all 0.2s ease]",
          _disabled: {
            cursor: "not-allowed",
            opacity: 0.5,
          },
        }),
        variant === "primary" &&
          css({
            backgroundColor: "core.blue.70",
            color: "[white]",
            _hover: {
              backgroundColor: "core.blue.80",
            },
          }),
        variant === "tertiary" &&
          css({
            backgroundColor: "[transparent]",
            color: "core.gray.90",
            border: "1px solid",
            borderColor: "core.gray.30",
            _hover: {
              backgroundColor: "core.gray.10",
            },
          }),
        size === "small" &&
          css({
            paddingX: "spacing.4",
            paddingY: "spacing.3",
            fontSize: "size.textsm",
          }),
        size === "xs" &&
          css({
            paddingX: "spacing.3",
            paddingY: "spacing.2",
            fontSize: "size.textxs",
          }),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};
