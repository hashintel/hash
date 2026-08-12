import { useId } from "react";

import { cx } from "@hashintel/ds-helpers/css";

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
const FormField = ({
  className,
  children,
  label,
  hideLabel,
  size = "md",
  labelDirection = "left",
  layout = "block",
  inputAlign = "start",
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
} & (
  | {
      layout: "inline";
      inputAlign?: "start" | "end";
    }
  | {
      layout?: "block";
      inputAlign?: never;
    }
) &
  SharedInputAndFieldProps) => {
  // resolve logical start/end to a physical side against labelDirection
  const classes = styles({
    size,
    layout,
    labelDirection,
    hideLabel: !!hideLabel,
    inputAlign:
      (inputAlign === "end") !== (labelDirection === "right")
        ? "right"
        : "left",
  });
  const id = useId();
  // inline nests the visible label inside inlineControl, where a <legend>
  // would not name the fieldset — a visually hidden legend rendered as a
  // direct child does that instead, and the visible label becomes a <span>
  const labelType =
    as === "label"
      ? { as, htmlFor: id }
      : { as: layout === "inline" ? ("span" as const) : as };

  const labelEl = (
    <Label
      {...labelType}
      size={size}
      direction={labelDirection}
      required={required}
      actions={layout === "block" ? labelActions : undefined}
      tooltip={labelTooltip}
      disabled={disabled}
      hide={hideLabel}
      className={classes.label}
    >
      {label}
    </Label>
  );

  const descriptionEl = description && (
    <Description
      size={size}
      direction={labelDirection}
      disabled={disabled}
      className={classes.description}
      data-part="description"
    >
      {description}
    </Description>
  );

  const descriptionBottomEl = descriptionBottom && (
    <Description
      size={size}
      direction={labelDirection}
      disabled={disabled}
      className={classes.descriptionBottom}
      data-part="descriptionBottom"
    >
      {descriptionBottom}
    </Description>
  );
  const errorsEl = errors && (
    <Errors
      errors={errors}
      size={size}
      direction={labelDirection}
      disabled={disabled}
      className={classes.errors}
      data-part="errors"
    />
  );

  const controlEl =
    as === "label" ? (
      <FieldIdProvider id={id}>{children}</FieldIdProvider>
    ) : (
      children
    );

  if (layout === "inline") {
    return (
      <fieldset
        className={cx(classes.root, className)}
        data-part="form-field"
        data-layout="inline"
      >
        {as === "legend" && <legend className={classes.legend}>{label}</legend>}
        {descriptionEl}
        <div className={classes.inlineControl}>
          {labelEl}
          <div className={classes.inlineInput}>
            {controlEl}
            {labelActions && (
              <span className={classes.inlineLabelActions}>{labelActions}</span>
            )}
          </div>
        </div>
        {descriptionBottomEl}
        {errorsEl}
      </fieldset>
    );
  }

  return (
    <fieldset className={cx(classes.root, className)} data-part="form-field">
      {labelEl}
      {descriptionEl}
      {controlEl}
      {descriptionBottomEl}
      {errorsEl}
    </fieldset>
  );
};

FormField.Label = Label;
FormField.Description = Description;
FormField.Errors = Errors;

export { FormField };
