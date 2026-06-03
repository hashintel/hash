import { cx } from "@hashintel/ds-helpers/css";

import { type BaseInputProps } from "./base-input";
import { styles } from "./input-connector.recipe";

type InputStyles = Pick<
  BaseInputProps,
  "readonly" | "variant" | "invalid" | "disabled"
> & { hasPrefix?: boolean; hasSuffix?: boolean };

export const InputConnectOr = ({
  className,
  left,
  right,
  size,
}: {
  className?: string;
  size: Pick<BaseInputProps, "size">;
  left: InputStyles;
  right: InputStyles;
}) => {
  if (
    [left, right].some((input) => !!input.readonly || left.variant === "subtle")
  ) {
    return null;
  }

  const classes = styles({
    size,
    leftInvalid: left.invalid,
    rightInvalid: right.invalid,
  });

  return (
    <svg
      width={20}
      height={62}
      viewBox="0 0 20 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx(className, classes.connector)}
    >
      <path
        d="M 0 9 A 10 9 0 0 0 20 9 L 20 53 A 10 9 0 0 0 0 53 Z"
        fill="inherit"
      />
      <path
        d="M 0 9 A 10 9 0 0 0 20 9"
        stroke="currentColor"
        strokeWidth={2}
        fill="none"
      />
      <path
        d="M 0 53 A 10 9 0 0 1 20 53"
        stroke="currentColor"
        strokeWidth={2}
        fill="none"
      />
    </svg>
  );
};
