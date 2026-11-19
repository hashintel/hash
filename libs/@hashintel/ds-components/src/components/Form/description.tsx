import { cx } from "@hashintel/ds-helpers/css";

import { styles } from "./description.recipe";

import type { FormInputSize } from "../../util/form-shared";

export const Description = ({
  className,
  children,
  size = "md",
  direction = "left",
  disabled,
  "data-part": dataPart,
}: {
  className?: string;
  children: React.ReactNode;

  size?: FormInputSize;
  /** `right` right-aligns the text, matching a right-`labelDirection` field */
  direction?: "left" | "right";

  disabled?: boolean;

  "data-part"?: string;
}) => {
  const classes = styles({ size, direction, disabled });

  return (
    <span data-part={dataPart} className={cx(classes.description, className)}>
      {children}
    </span>
  );
};

Description.displayName = "Form.Field.Description";
