import { Description } from "./description";
import { Errors } from "./errors";
import { styles } from "./form-field.recipe";
import { Label } from "./label";

import type {
  FormInputSize,
  SharedInputAndFieldProps,
} from "../../util/form-shared";

export const FormField = ({
  className,
  children,
  label,
  hideLabel,
  size = "md",
  layout: _layout,
  labelDirection = "left",
  description,
  descriptionBottom,
  labelTooltip,
  labelActions,
  errors,
  required,
  disabled,
  ...labelProps
}: {
  className?: string;
  children: React.ReactNode;
  label: React.ReactNode;
  hideLabel?: boolean;
  as?: "label" | "legend";

  size?: FormInputSize;
  layout?: "block" | "inline" | "inlineNoWrap";
  labelDirection?: "left" | "right";

  description?: React.ReactNode;
  descriptionBottom?: React.ReactNode;
  labelTooltip?: string | React.ReactNode;
  labelActions?: React.ReactNode[];

  errors?: Array<string | React.ReactNode>;
} & (
  | {
      as?: "label";
      htmlFor: string;
    }
  | {
      as: "legend";
      htmlFor: never;
    }
) &
  SharedInputAndFieldProps) => {
  const classes = styles({ size });

  return (
    <fieldset className={className}>
      <Label
        size={size}
        direction={labelDirection}
        required={required}
        actions={labelActions}
        tooltip={labelTooltip}
        disabled={disabled}
        hide={hideLabel}
        className={classes.label}
        {...labelProps}
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
      {children}
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
