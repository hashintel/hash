import { css, cx } from "@hashintel/ds-helpers/css";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

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
          borderRadius: "radius.6",
          cursor: "pointer",
          overflow: "hidden",
          paddingX: "spacing.5",
          paddingY: "spacing.4",
          fontSize: "size.textsm",
          _disabled: {
            cursor: "not-allowed",
          },
        }),
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
