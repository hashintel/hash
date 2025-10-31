import { css, cx } from "@hashintel/ds-helpers/css";

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  fullWidth?: boolean;
}

export const TextField = ({ fullWidth, className, ...props }: TextFieldProps) => {
  return (
    <input
      className={cx(
        css({
          padding: "spacing.3",
          borderRadius: "radius.4",
          border: "1px solid",
          borderColor: "core.gray.30",
          fontSize: "size.textsm",
          backgroundColor: "[white]",
          transition: "[all 0.2s ease]",
          _focus: {
            outline: "none",
            borderColor: "core.blue.70",
          },
          _disabled: {
            backgroundColor: "core.gray.10",
            cursor: "not-allowed",
          },
        }),
        fullWidth && css({ width: "[100%]" }),
        className,
      )}
      {...props}
    />
  );
};
