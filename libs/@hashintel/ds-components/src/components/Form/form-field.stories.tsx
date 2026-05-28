import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
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
    <FormField {...args} as="label" label="Disabled" disabled>
      <ControlledTextInput
        name="form-field-disabled"
        initialValue="Disabled value"
        size={args.size}
        disabled
      />
    </FormField>

    <FormField {...args} as="label" label="Required" required>
      <ControlledTextInput name="form-field-required" size={args.size} />
    </FormField>

    <FormField
      {...args}
      as="label"
      label="Description"
      description="A short description above the input"
    >
      <ControlledTextInput name="form-field-description" size={args.size} />
    </FormField>

    <FormField
      {...args}
      as="label"
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
      label="One error"
      errors={["Something went wrong"]}
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
      label="Multiple errors"
      errors={["First error", "Second error", "Third error"]}
    >
      <ControlledTextInput
        name="form-field-multiple-errors"
        size={args.size}
        invalid
      />
    </FormField>

    <FormField {...args} as="label" label="Label hidden (visually)" hideLabel>
      <ControlledTextInput
        name="form-field-hidden-label"
        placeholder="Label hidden (visually)"
        size={args.size}
      />
    </FormField>

    <FormField
      {...args}
      as="label"
      label="Tooltip"
      labelTooltip="Extra information about this field"
    >
      <ControlledTextInput name="form-field-tooltip" size={args.size} />
    </FormField>

    <FormField
      {...args}
      as="label"
      label="Actions"
      labelActions={[<ActionButton key="action" />]}
    >
      <ControlledTextInput name="form-field-actions" size={args.size} />
    </FormField>

    <FormField {...args} as="label" label="Kitchen sink" {...kitchenSinkProps}>
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

// In a real application, the contexts, field components, and `useAppForm`
// would live in their own module (eg. `app/form.tsx`) and be imported by
// every form in the app — so all forms share styling, validation display,
// and submit behaviour for free.

const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const TextField = ({
  label,
  description,
  size,
  required,
}: {
  label: string;
  description?: string;
  size?: FormInputSize;
  required?: boolean;
}) => {
  const field = useFieldContext<string>();
  return (
    <FormField
      as="label"
      label={label}
      description={description}
      size={size}
      required={required}
      errors={field.state.meta.errors}
    >
      <TextInput
        name={field.name}
        value={field.state.value}
        onChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
        size={size}
        invalid={field.state.meta.errors.length > 0}
      />
    </FormField>
  );
};

const IntegerField = ({
  label,
  description,
  size,
  required,
  min,
  max,
}: {
  label: string;
  description?: string;
  size?: FormInputSize;
  required?: boolean;
  min?: number;
  max?: number;
}) => {
  const field = useFieldContext<number>();
  return (
    <FormField
      as="label"
      label={label}
      description={description}
      size={size}
      required={required}
      errors={field.state.meta.errors}
    >
      <NumberInput
        type="integer"
        name={field.name}
        value={field.state.value}
        min={min}
        max={max}
        onChange={(value) => field.handleChange(value ?? 0)}
        onBlur={field.handleBlur}
        size={size}
        invalid={field.state.meta.errors.length > 0}
      />
    </FormField>
  );
};

const SubmitButton = ({
  children,
  size,
}: {
  children: string;
  size?: FormInputSize;
}) => {
  const form = useFormContext();
  return (
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
            size={size}
            disabled={!canSubmit}
            loading={isSubmitting}
          >
            {children}
          </Button>
        </div>
      )}
    </form.Subscribe>
  );
};

const { useAppForm } = createFormHook({
  fieldComponents: { TextField, IntegerField },
  formComponents: { SubmitButton },
  fieldContext,
  formContext,
});

export const WithTanstackForm: Story<FormFieldArgs> = (args) => {
  const form = useAppForm({
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
      <form.AppField
        name="fullName"
        validators={{
          onChange: ({ value }) =>
            value.trim().length === 0 ? "Full name is required" : undefined,
        }}
      >
        {(field) => (
          <field.TextField label="Full name" size={args.size} required />
        )}
      </form.AppField>

      <form.AppField
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
          <field.TextField
            label="Email"
            description="We'll never share your email"
            size={args.size}
            required
          />
        )}
      </form.AppField>

      <form.AppField
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
          <field.TextField
            label="Username"
            description="Lowercase letters, digits, and underscores"
            size={args.size}
            required
          />
        )}
      </form.AppField>

      <form.AppField
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
          <field.IntegerField
            label="Age"
            size={args.size}
            min={0}
            max={120}
            required
          />
        )}
      </form.AppField>

      <form.AppForm>
        <form.SubmitButton size={args.size}>Submit</form.SubmitButton>
      </form.AppForm>
    </form>
  );
};
