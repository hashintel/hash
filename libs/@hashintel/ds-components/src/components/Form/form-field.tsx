import { Description } from "./description";
import { Errors } from "./errors";
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
  size,
  layout,
  labelDirection,
  description,
  descriptionBottom,
  labelTooltip,
  labelActions,
  errors,
  required,
  disabled,
  invalid,
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
  return (
    <div className={className}>
      <Label
        size={size}
        direction={labelDirection}
        required={required}
        actions={labelActions}
        tooltip={labelTooltip}
        disabled={disabled}
        hide={hideLabel}
        {...labelProps}
      >
        {label}
      </Label>
      {description && (
        <Description size={size} direction={labelDirection} disabled={disabled}>
          {description}
        </Description>
      )}
      {children}
      {descriptionBottom && (
        <Description size={size} direction={labelDirection} disabled={disabled}>
          {descriptionBottom}
        </Description>
      )}
      {errors && (
        <Errors errors={errors} size={size} direction={labelDirection} />
      )}
    </div>
  );
};
