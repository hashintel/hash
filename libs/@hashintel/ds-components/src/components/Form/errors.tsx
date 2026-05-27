import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../Icon/icon";
import { styles } from "./errors.recipe";

import type { FormInputSize } from "../../util/form-shared";

export const Errors = ({
  className,
  errors,
  size,
  direction,
  "data-part": dataPart,
}: {
  className?: string;
  errors?: Array<string | React.ReactNode>;

  size?: FormInputSize;
  direction?: "left" | "right";

  "data-part"?: string;
}) => {
  if (!errors || errors.length === 0) {
    return null;
  }
  const classes = styles({ size, direction });

  if (errors.length === 1) {
    return (
      <span
        role="alert"
        data-part={dataPart}
        className={cx(classes.error, className)}
      >
        <Icon name="error" className={classes.icon} />
        {errors[0]}
      </span>
    );
  }

  return (
    <ul className={className} role="alert" data-part={dataPart}>
      {errors.map((error, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <li className={classes.error} key={index}>
          <Icon name="error" className={classes.icon} />
          {error}
        </li>
      ))}
    </ul>
  );
};
