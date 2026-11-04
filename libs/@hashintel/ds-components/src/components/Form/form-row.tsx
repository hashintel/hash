import { type FormField } from "./form-field";
import { styles } from "./form-row.recipe";

import type { Errors } from "./errors";

export const FormRow = ({
  className,
  children,
  errors,
  gap = "md",
  align = "bottom",
  noWrap = false,
}: {
  className?: string;
  children:
    | React.ReactElement<typeof FormField>
    | Array<React.ReactElement<typeof FormField>>;
  /** A `Form.Field.Errors` element rendered under the whole row, for messages that span its fields */
  errors?: React.ReactElement<typeof Errors>;
  /** Horizontal spacing between the row's fields; `spaceBetween` spreads them to the row's edges */
  gap?: "md" | "lg" | "xl" | "spaceBetween" | "none";
  align?: "bottom" | "center" | "top";
  noWrap?: boolean;
}) => {
  const classes = styles({ gap, align, noWrap });

  return (
    <div className={className}>
      <div className={classes.row}>{children}</div>
      {errors}
    </div>
  );
};

FormRow.displayName = "Form.Row";
