import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./description.recipe";

import type { FormInputSize } from "../../util/form-shared";

export const Description = ({
  className,
  children,
  size,
  direction,
  disabled,
}: {
  className?: string;
  children: React.ReactNode;

  size?: FormInputSize;
  direction?: "left" | "right";

  disabled?: boolean;
}) => {
  const classes = styles({ size, direction, disabled });

  return <p className={cx(classes.description, className)}>{children}</p>;
};
