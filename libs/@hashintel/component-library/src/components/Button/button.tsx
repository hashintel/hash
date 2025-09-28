import { css, cx } from "@hashintel/styled-system/css";
import { forwardRef } from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  radius?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  blurLevel?: number;
  glassThickness?: number;
  refractiveIndex?: number;
  bezelWidth?: number;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, disabled, style, ...props }) => {
    return (
      <button
        type="button"
        className={cx(
          css({
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "semibold",
            borderRadius: "md",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "all",
            transitionDuration: "200ms",
            overflow: "hidden",
            paddingX: "3",
            paddingY: "2",
            fontSize: "base",
          }),
          className
        )}
        {...props}
        style={style}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
