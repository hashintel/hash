import { type FormField } from "./form-field";
import { styles } from "./form-row.recipe";

import type { Errors } from "./errors";

export const FormRow = ({
  className,
  children,
  errors,
  gap = "default",
  align = "bottom",
}: {
  className?: string;
  children:
    | React.ReactElement<typeof FormField>
    | Array<React.ReactElement<typeof FormField>>;
  errors?: React.ReactElement<typeof Errors>;
  gap?: "default" | "large" | "extraLarge" | "spaceBetween" | "connected";
  align?: "bottom" | "center" | "top";
}) => {
  const classes = styles({ gap, align });

  return (
    <div className={className}>
      <div className={classes.row}>{children}</div>
      {errors}
    </div>
  );
};
