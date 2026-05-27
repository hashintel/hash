import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./errors.recipe";

import type { FormInputSize } from "../../util/form-shared";

export const Errors = ({
  className,
  errors,
  size,
  direction,
}: {
  className?: string;
  errors?: Array<string | React.ReactNode>;

  size?: FormInputSize;
  direction?: "left" | "right";
}) => {
  if (!errors || errors.length === 0) {
    return null;
  }
  const classes = styles({ size, direction });

  if (errors.length === 1) {
    return <p className={cx(classes.error, className)}>{errors[0]}</p>;
  }
  return (
    <ul className={className}>
      {errors.map((error, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <li className={cx(classes.error)} key={index}>
          {error}
        </li>
      ))}
    </ul>
  );
};
