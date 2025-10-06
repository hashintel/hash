import { css, cx } from "@hashintel/ds-helpers/css";

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

export const Button: React.FC<ButtonProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <button
      type="button"
      className={cx(
        css({
          position: "relative",
          fontWeight: "medium",
          borderRadius: "lg",
          cursor: "pointer",
          overflow: "hidden",
          paddingX: "3",
          paddingY: "1.5",
          fontSize: "sm",
          _disabled: {
            cursor: "not-allowed",
          },
        }),
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};
