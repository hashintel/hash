import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes, type FormInputSize } from "../../util/form-shared";
import { Button } from "../Button/button";
import { NumberInput } from "../NumberInput/number-input";
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
  argTypes: {
    label: {
      control: { type: "text" },
      description: "Label text for the field",
    },
    hideLabel: {
      control: { type: "boolean" },
      description: "Visually hide the label while keeping it accessible",
    },
    size: {
      control: { type: "select" },
      options: formInputSizes,
      description: "Size of the field",
    },
    labelDirection: {
      control: { type: "radio" },
      options: labelDirections,
      description: "Alignment of label and helper content",
    },
    description: {
      control: { type: "text" },
      description: "Helper text shown above the input",
    },
    descriptionBottom: {
      control: { type: "text" },
      description: "Helper text shown below the input",
    },
    labelTooltip: {
      control: { type: "text" },
      description: "Tooltip shown next to the label",
    },
    required: {
      control: { type: "boolean" },
      description: "Mark the field as required",
    },
    disabled: {
      control: { type: "boolean" },
      description: "Disable the field",
    },
  },
  args: {
    as: "label" as const,
  },
} satisfies StoryDefault<React.ComponentProps<typeof FormField>>;

type FormFieldArgs = React.ComponentProps<typeof FormField>;

export const Default: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    <FormField
      {...args}
      as="label"
      htmlFor="form-field-disabled"
      label="Disabled"
      disabled
    >
      <ControlledTextInput
        name="form-field-disabled"
        initialValue="Disabled value"
        size={args.size}
        disabled
      />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-required"
      label="Required"
      required
    >
      <ControlledTextInput name="form-field-required" size={args.size} />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-description"
      label="Description"
      description="A short description above the input"
    >
      <ControlledTextInput name="form-field-description" size={args.size} />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-description-bottom"
      label="Description on bottom"
      descriptionBottom="A short description below the input"
    >
      <ControlledTextInput
        name="form-field-description-bottom"
        size={args.size}
      />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-one-error"
      label="One error"
      errors={["Something went wrong"]}
      invalid
    >
      <ControlledTextInput
        name="form-field-one-error"
        size={args.size}
        invalid
      />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-multiple-errors"
      label="Multiple errors"
      errors={["First error", "Second error", "Third error"]}
      invalid
    >
      <ControlledTextInput
        name="form-field-multiple-errors"
        size={args.size}
        invalid
      />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-hidden-label"
      label="Label hidden (visually)"
      hideLabel
    >
      <ControlledTextInput
        name="form-field-hidden-label"
        placeholder="Label hidden (visually)"
        size={args.size}
      />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-tooltip"
      label="Tooltip"
      labelTooltip="Extra information about this field"
    >
      <ControlledTextInput name="form-field-tooltip" size={args.size} />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-actions"
      label="Actions"
      labelActions={[<ActionButton key="action" />]}
    >
      <ControlledTextInput name="form-field-actions" size={args.size} />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-kitchen-sink"
      label="Kitchen sink"
      {...kitchenSinkProps}
    >
      <ControlledTextInput
        name="form-field-kitchen-sink"
        initialValue="Kitchen sink value"
        size={args.size}
        disabled
        invalid
      />
    </FormField>

    <FormField
      {...args}
      as="label"
      htmlFor="form-field-kitchen-sink"
      label="Kitchen sink disabled"
      {...kitchenSinkProps}
      disabled
    >
      <ControlledTextInput
        name="form-field-kitchen-sink"
        initialValue="Kitchen sink value"
        size={args.size}
        disabled
        invalid
      />
    </FormField>
  </div>
);

export const FormSize: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    {formInputSizes.map((size: FormInputSize) => (
      <FormField
        {...args}
        as="label"
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

const { labelActions: _labelActions, ...kitchenSinkPropsNoActions } =
  kitchenSinkProps;

export const LabelDirection: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    {labelDirections.map((direction) => (
      <FormField
        {...args}
        as="label"
        key={direction}
        htmlFor={`form-field-direction-${direction}`}
        label={`Direction: ${direction}`}
        labelDirection={direction}
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name={`form-field-direction-${direction}`}
          initialValue="Kitchen sink value"
          size={args.size}
          disabled
          invalid
        />
      </FormField>
    ))}
    {labelDirections.map((direction) => (
      <FormField
        {...args}
        as="label"
        key={`${direction}-no-actions`}
        htmlFor={`form-field-direction-${direction}-no-actions`}
        label={`Direction: ${direction} (no actions)`}
        labelDirection={direction}
        {...kitchenSinkPropsNoActions}
      >
        <ControlledTextInput
          name={`form-field-direction-${direction}-no-actions`}
          initialValue="Kitchen sink value"
          size={args.size}
          disabled
          invalid
        />
      </FormField>
    ))}
  </div>
);

const formStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[24px]",
  padding: "[16px]",
  maxWidth: "[420px]",
});

const submitRowStyle = css({
  display: "flex",
  justifyContent: "flex-end",
  marginTop: "[8px]",
});

export const WithTanstackForm: Story<FormFieldArgs> = (args) => {
  const form = useForm({
    defaultValues: {
      fullName: "",
      email: "",
      username: "",
      age: 18,
    },
    onSubmit: ({ value }) => {
      // eslint-disable-next-line no-alert
      window.alert(`Submitted:\n${JSON.stringify(value, null, 2)}`);
    },
  });

  return (
    <form
      className={formStyle}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="fullName"
        validators={{
          onChange: ({ value }) =>
            value.trim().length === 0 ? "Full name is required" : undefined,
        }}
      >
        {(field) => (
          <FormField
            as="label"
            htmlFor={field.name}
            label="Full name"
            size={args.size}
            required
            invalid={field.state.meta.errors.length > 0}
            errors={field.state.meta.errors}
          >
            <TextInput
              name={field.name}
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
              onBlur={field.handleBlur}
              size={args.size}
              invalid={field.state.meta.errors.length > 0}
            />
          </FormField>
        )}
      </form.Field>

      <form.Field
        name="email"
        validators={{
          onChange: ({ value }) => {
            if (value.trim().length === 0) {
              return "Email is required";
            }
            if (!/^\S+@\S+\.\S+$/.test(value)) {
              return "Enter a valid email address";
            }
            return undefined;
          },
        }}
      >
        {(field) => (
          <FormField
            as="label"
            htmlFor={field.name}
            label="Email"
            description="We'll never share your email"
            size={args.size}
            required
            invalid={field.state.meta.errors.length > 0}
            errors={field.state.meta.errors}
          >
            <TextInput
              name={field.name}
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
              onBlur={field.handleBlur}
              size={args.size}
              invalid={field.state.meta.errors.length > 0}
            />
          </FormField>
        )}
      </form.Field>

      <form.Field
        name="username"
        validators={{
          onChange: ({ value }) => {
            if (value.trim().length === 0) {
              return "Username is required";
            }
            if (!/^[a-z0-9_]+$/.test(value)) {
              return "Lowercase letters, digits, and underscores only";
            }
            return undefined;
          },
        }}
      >
        {(field) => (
          <FormField
            as="label"
            htmlFor={field.name}
            label="Username"
            description="Lowercase letters, digits, and underscores"
            size={args.size}
            required
            invalid={field.state.meta.errors.length > 0}
            errors={field.state.meta.errors}
          >
            <TextInput
              name={field.name}
              value={field.state.value}
              onChange={(value) => field.handleChange(value)}
              onBlur={field.handleBlur}
              size={args.size}
              invalid={field.state.meta.errors.length > 0}
            />
          </FormField>
        )}
      </form.Field>

      <form.Field
        name="age"
        validators={{
          onChange: ({ value }) => {
            if (value < 18) {
              return "Must be 18 or older";
            }
            if (value > 120) {
              return "Must be 120 or younger";
            }
            return undefined;
          },
        }}
      >
        {(field) => (
          <FormField
            as="label"
            htmlFor={field.name}
            label="Age"
            size={args.size}
            required
            invalid={field.state.meta.errors.length > 0}
            errors={field.state.meta.errors}
          >
            <NumberInput
              type="integer"
              name={field.name}
              value={field.state.value}
              min={0}
              max={120}
              onChange={(value) => field.handleChange(value ?? 0)}
              onBlur={field.handleBlur}
              size={args.size}
              invalid={field.state.meta.errors.length > 0}
            />
          </FormField>
        )}
      </form.Field>

      <form.Subscribe
        selector={(state) => ({
          canSubmit: state.canSubmit,
          isSubmitting: state.isSubmitting,
        })}
      >
        {({ canSubmit, isSubmitting }) => (
          <div className={submitRowStyle}>
            <Button
              type="submit"
              variant="solid"
              tone="brand"
              size={args.size}
              disabled={!canSubmit}
              loading={isSubmitting}
            >
              Submit
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
};
