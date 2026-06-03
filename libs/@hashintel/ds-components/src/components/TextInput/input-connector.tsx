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
  size = "md",
}: {
  className?: string;
  size: BaseInputProps["size"];
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
    invalid: left.invalid,
    disabled: left.disabled,
  });

  return (
    <svg
      viewBox="0 0 20 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cx(className, classes.root)}
    >
      <path
        d="M 0 9 A 10 9 0 0 0 20 9 L 20 53 A 10 9 0 0 0 0 53 Z"
        fill="inherit"
      />
      <path
        d="M 0 9 A 10 9 0 0 0 20 9"
        stroke="currentColor"
        strokeWidth="inherit"
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
      <path
        d="M 0 53 A 10 9 0 0 1 20 53"
        stroke="currentColor"
        strokeWidth="inherit"
        vectorEffect="non-scaling-stroke"
        fill="none"
      />
    </svg>
  );
};
