import { useId } from "react";

import { Description } from "./description";
import { Errors } from "./errors";
import { FieldIdProvider } from "./field-id-context";
import { styles } from "./form-field.recipe";
import { Label } from "./label";

import type { SharedInputAndFieldProps } from "../../util/form-shared";

/**
 * A form field should only ever wrap a single input, and will automatically connect the label to that input.
 * If implementing your own input you will need to consume useFieldId for the label to automatically be connected
 */
export const FormField = ({
  className,
  children,
  label,
  hideLabel,
  size = "md",
  labelDirection = "left",
  description,
  descriptionBottom,
  labelTooltip,
  labelActions,
  errors,
  required,
  disabled,
  as = "label",
}: {
  className?: string;
  children: React.ReactNode;
  label: React.ReactNode;
  hideLabel?: boolean;
  as?: "label" | "legend";

  labelDirection?: "left" | "right";

  description?: React.ReactNode;
  descriptionBottom?: React.ReactNode;
  labelTooltip?: string | React.ReactNode;
  labelActions?: React.ReactNode[];

  errors?: Array<string | React.ReactNode>;
} & SharedInputAndFieldProps) => {
  const classes = styles({ size });
  const id = useId();
  const labelType = as === "label" ? { as, htmlFor: id } : { as };

  return (
    <fieldset className={className}>
      <Label
        {...labelType}
        size={size}
        direction={labelDirection}
        required={required}
        actions={labelActions}
        tooltip={labelTooltip}
        disabled={disabled}
        hide={hideLabel}
        className={classes.label}
      >
        {label}
      </Label>
      {description && (
        <Description
          size={size}
          direction={labelDirection}
          disabled={disabled}
          className={classes.description}
          data-part="description"
        >
          {description}
        </Description>
      )}
      {as === "label" ? (
        <FieldIdProvider id={id}>{children}</FieldIdProvider>
      ) : (
        children
      )}
      {descriptionBottom && (
        <Description
          size={size}
          direction={labelDirection}
          disabled={disabled}
          className={classes.descriptionBottom}
          data-part="descriptionBottom"
        >
          {descriptionBottom}
        </Description>
      )}
      {errors && (
        <Errors
          errors={errors}
          size={size}
          direction={labelDirection}
          disabled={disabled}
          className={classes.errors}
          data-part="errors"
        />
      )}
    </fieldset>
  );
};
