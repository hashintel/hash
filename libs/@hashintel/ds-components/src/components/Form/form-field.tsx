import type {
  FormInputSize,
  SharedInputAndFieldProps,
} from "../../util/form-shared";

export const FormField = (
  props: {
    className?: string;
    children: React.ReactNode;
    label: React.ReactNode;
    hideLabel?: boolean;
    as?: "label" | "legend";
    htmlFor: string;

    size?: FormInputSize;
    layout?: "block" | "inline" | "inlineNoWrap";
    labelDirection?: "left" | "right";

    description?: React.ReactNode;
    descriptionBottom?: React.ReactNode;
    labelTooltip?: string | React.ReactNode;
    labelActions?: React.ReactNode[];

    errors?: Array<string | React.ReactNode>;
  } & SharedInputAndFieldProps,
) => {
  return <div {...props} />;
};
