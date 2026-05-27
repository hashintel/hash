import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes, type FormInputSize } from "../../util/form-shared";
import { Button } from "../Button/button";
import { TextInput } from "../TextInput/text-input";
import { FormField } from "./form-field";

import type { Story, StoryDefault } from "@ladle/react";

type LabelDirection = NonNullable<
  React.ComponentProps<typeof FormField>["labelDirection"]
>;

const labelDirections = [
  "left",
  "right",
] as const satisfies readonly LabelDirection[];

const noop = () => {};

const ControlledTextInput = (
  props: Omit<React.ComponentProps<typeof TextInput>, "value" | "onChange"> & {
    initialValue?: string;
  },
) => {
  const { initialValue = "", ...rest } = props;
  const [value, setValue] = useState(initialValue);
  return <TextInput {...rest} value={value} onChange={setValue} />;
};

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[32px]",
  padding: "[16px]",
});

const ActionButton = () => (
  <Button variant="ghost" size="xs" onClick={noop}>
    Action
  </Button>
);

const kitchenSinkProps = {
  description: "A short description above the input",
  descriptionBottom: "A short description below the input",
  labelTooltip: "Helpful tooltip text",
  labelActions: [<ActionButton key="action" />],
  errors: ["First error", "Second error"],
  required: true,
};

export default {
  title: "Components/FormField",
} satisfies StoryDefault;

export const Default: Story = () => (
  <div className={sectionStyle}>
    <FormField htmlFor="form-field-disabled" label="Disabled" disabled>
      <ControlledTextInput
        name="form-field-disabled"
        initialValue="Disabled value"
        disabled
      />
    </FormField>

    <FormField htmlFor="form-field-required" label="Required" required>
      <ControlledTextInput name="form-field-required" />
    </FormField>

    <FormField
      htmlFor="form-field-description"
      label="Description"
      description="A short description above the input"
    >
      <ControlledTextInput name="form-field-description" />
    </FormField>

    <FormField
      htmlFor="form-field-description-bottom"
      label="Description on bottom"
      descriptionBottom="A short description below the input"
    >
      <ControlledTextInput name="form-field-description-bottom" />
    </FormField>

    <FormField
      htmlFor="form-field-one-error"
      label="One error"
      errors={["Something went wrong"]}
      invalid
    >
      <ControlledTextInput name="form-field-one-error" invalid />
    </FormField>

    <FormField
      htmlFor="form-field-multiple-errors"
      label="Multiple errors"
      errors={["First error", "Second error", "Third error"]}
      invalid
    >
      <ControlledTextInput name="form-field-multiple-errors" invalid />
    </FormField>

    <FormField
      htmlFor="form-field-hidden-label"
      label="Label hidden (visually)"
      hideLabel
    >
      <ControlledTextInput
        name="form-field-hidden-label"
        placeholder="Label hidden (visually)"
      />
    </FormField>

    <FormField
      htmlFor="form-field-tooltip"
      label="Tooltip"
      labelTooltip="Extra information about this field"
    >
      <ControlledTextInput name="form-field-tooltip" />
    </FormField>

    <FormField
      htmlFor="form-field-actions"
      label="Actions"
      labelActions={[<ActionButton key="action" />]}
    >
      <ControlledTextInput name="form-field-actions" />
    </FormField>

    <FormField
      htmlFor="form-field-kitchen-sink"
      label="Kitchen sink"
      {...kitchenSinkProps}
    >
      <ControlledTextInput
        name="form-field-kitchen-sink"
        initialValue="Kitchen sink value"
        disabled
        invalid
      />
    </FormField>

    <FormField
      htmlFor="form-field-kitchen-sink"
      label="Kitchen sink disabled"
      {...kitchenSinkProps}
      disabled
    >
      <ControlledTextInput
        name="form-field-kitchen-sink"
        initialValue="Kitchen sink value"
        disabled
        invalid
      />
    </FormField>
  </div>
);

export const FormSize: Story = () => (
  <div className={sectionStyle}>
    {formInputSizes.map((size: FormInputSize) => (
      <FormField
        key={size}
        htmlFor={`form-field-size-${size}`}
        label={`Size: ${size}`}
        size={size}
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name={`form-field-size-${size}`}
          initialValue="Kitchen sink value"
          size={size}
          disabled
          invalid
        />
      </FormField>
    ))}
  </div>
);

export const LabelDirection: Story = () => (
  <div className={sectionStyle}>
    {labelDirections.map((direction) => (
      <FormField
        key={direction}
        htmlFor={`form-field-direction-${direction}`}
        label={`Direction: ${direction}`}
        labelDirection={direction}
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name={`form-field-direction-${direction}`}
          initialValue="Kitchen sink value"
          disabled
          invalid
        />
      </FormField>
    ))}
  </div>
);
