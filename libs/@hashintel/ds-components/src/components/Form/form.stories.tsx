import { createFormHook, createFormHookContexts } from "@tanstack/react-form";
import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes, type FormInputSize } from "../../util/form-shared";
import { Button } from "../Button/button";
import { CheckboxGroup } from "../CheckboxGroup/checkbox-group";
import { NumberInput } from "../NumberInput/number-input";
import { RadioGroup } from "../RadioGroup/radio-group";
import { TextInput } from "../TextInput/text-input";
import { Errors } from "./errors";
import { Form } from "./form";

import type { Story, StoryDefault } from "@ladle/react";

type LabelDirection = NonNullable<
  React.ComponentProps<typeof Form.Field>["labelDirection"]
>;

const labelDirections = [
  "left",
  "right",
] as const satisfies readonly LabelDirection[];

type FieldLayout = NonNullable<
  React.ComponentProps<typeof Form.Field>["layout"]
>;

const fieldLayouts = [
  "block",
  "inline",
] as const satisfies readonly FieldLayout[];

type InputAlign = NonNullable<
  React.ComponentProps<typeof Form.Field>["inputAlign"]
>;

const inputAligns = ["start", "end"] as const satisfies readonly InputAlign[];

type FormRowGap = NonNullable<React.ComponentProps<typeof Form.Row>["gap"]>;
type FormRowAlign = NonNullable<React.ComponentProps<typeof Form.Row>["align"]>;

const formRowGaps = [
  "md",
  "lg",
  "xl",
  "spaceBetween",
  "none",
] as const satisfies readonly FormRowGap[];

const formRowAligns = [
  "bottom",
  "center",
  "top",
] as const satisfies readonly FormRowAlign[];

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

const ControlledRadioGroup = (
  props: Omit<
    React.ComponentProps<typeof RadioGroup>,
    "value" | "onChange" | "items"
  >,
) => {
  const [value, setValue] = useState<"email" | "phone">("email");
  return (
    <RadioGroup
      {...props}
      items={[
        { value: "email", label: "Email" },
        { value: "phone", label: "Phone" },
      ]}
      value={value}
      onChange={setValue}
    />
  );
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
  title: "Components/Form",
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
      description:
        "Alignment of label and helper content; `right` mirrors the inline row",
    },
    layout: {
      control: { type: "radio" },
      options: fieldLayouts,
      description: "Arrangement of label and input",
    },
    inputAlign: {
      control: { type: "radio" },
      options: inputAligns,
      description:
        "Input alignment within an inline row (flips with labelDirection)",
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
} satisfies StoryDefault<React.ComponentProps<typeof Form.Field>>;

type FormFieldArgs = React.ComponentProps<typeof Form.Field>;

export const FormField: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    <Form.Field {...args} as="label" label="Disabled" disabled>
      <ControlledTextInput
        name="form-field-disabled"
        initialValue="Disabled value"
        size={args.size}
        disabled
      />
    </Form.Field>

    <Form.Field {...args} as="label" label="Required" required>
      <ControlledTextInput name="form-field-required" size={args.size} />
    </Form.Field>

    <Form.Field
      {...args}
      as="label"
      label="Description"
      description="A short description above the input"
    >
      <ControlledTextInput name="form-field-description" size={args.size} />
    </Form.Field>

    <Form.Field
      {...args}
      as="label"
      label="Description on bottom"
      descriptionBottom="A short description below the input"
    >
      <ControlledTextInput
        name="form-field-description-bottom"
        size={args.size}
      />
    </Form.Field>

    <Form.Field
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
    </Form.Field>

    <Form.Field
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
    </Form.Field>

    <Form.Field {...args} as="label" label="Label hidden (visually)" hideLabel>
      <ControlledTextInput
        name="form-field-hidden-label"
        placeholder="Label hidden (visually)"
        size={args.size}
      />
    </Form.Field>

    <Form.Field
      {...args}
      as="label"
      label="Tooltip"
      labelTooltip="Extra information about this field"
    >
      <ControlledTextInput name="form-field-tooltip" size={args.size} />
    </Form.Field>

    <Form.Field
      {...args}
      as="label"
      label="Actions"
      labelActions={[<ActionButton key="action" />]}
    >
      <ControlledTextInput name="form-field-actions" size={args.size} />
    </Form.Field>

    <Form.Field {...args} as="label" label="Kitchen sink" {...kitchenSinkProps}>
      <ControlledTextInput
        name="form-field-kitchen-sink"
        initialValue="Kitchen sink value"
        size={args.size}
        disabled
        invalid
      />
    </Form.Field>

    <Form.Field
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
    </Form.Field>
  </div>
);

export const FormFieldInlineLayout: Story<FormFieldArgs> = (args) => (
  <>
    <FormField {...args} layout="inline" />
    <div className={sectionStyle}>
      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="Kitchen sink (inputAlign: start)"
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name="form-field-inline-input-align-end"
          initialValue="Kitchen sink value"
          size={args.size}
          width="md"
          disabled
          invalid
        />
      </Form.Field>
    </div>
    <div className={sectionStyle}>
      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="Kitchen sink (inputAlign: end)"
        inputAlign="end"
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name="form-field-inline-input-align-end"
          initialValue="Kitchen sink value"
          size={args.size}
          width="md"
          disabled
          invalid
        />
      </Form.Field>
    </div>
  </>
);

export const FormFieldSize: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    {formInputSizes.map((size: FormInputSize) => (
      <Form.Field
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
      </Form.Field>
    ))}
    {formInputSizes.map((size: FormInputSize) => (
      <Form.Field
        {...args}
        as="label"
        key={`${size}-inline`}
        label={`Size: ${size} (inline)`}
        size={size}
        layout="inline"
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name={`form-field-size-${size}-inline`}
          initialValue="Kitchen sink value"
          size={size}
          disabled
          invalid
        />
      </Form.Field>
    ))}
  </div>
);

const { labelActions: _labelActions, ...kitchenSinkPropsNoActions } =
  kitchenSinkProps;

export const FormFieldLabelDirection: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    {labelDirections.map((direction) => (
      <Form.Field
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
      </Form.Field>
    ))}
    {labelDirections.map((direction) => (
      <Form.Field
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
      </Form.Field>
    ))}
    {labelDirections.map((direction) => (
      <Form.Field
        {...args}
        as="label"
        key={`${direction}-inline`}
        label={`Direction: ${direction} (inline)`}
        labelDirection={direction}
        layout="inline"
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name={`form-field-direction-${direction}-inline`}
          initialValue="Kitchen sink value"
          size={args.size}
          disabled
          invalid
        />
      </Form.Field>
    ))}
    {labelDirections.map((direction) => (
      <Form.Field
        {...args}
        as="label"
        key={`${direction}-inline-end`}
        label={`Direction: ${direction} (inline, inputAlign: end)`}
        labelDirection={direction}
        layout="inline"
        inputAlign="end"
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name={`form-field-direction-${direction}-inline-end`}
          initialValue="Kitchen sink value"
          size={args.size}
          width="md"
          disabled
          invalid
        />
      </Form.Field>
    ))}
  </div>
);

// custom (non-field) elements in a Form.Section space themselves
const sectionRowStyle = css({ marginBottom: "5" });

const sectionTextStyle = css({
  textStyle: "sm",
  color: "fg.subtle",
  marginY: "[30px]",
});

export const FormSection: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    <Form.Section>
      <Form.Field {...args} as="label" layout="inline" label="Name">
        <ControlledTextInput name="form-section-name" size={args.size} />
      </Form.Field>

      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="A much longer label"
        required
      >
        <ControlledTextInput
          name="form-section-longer-label"
          size={args.size}
        />
      </Form.Field>

      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="Actions"
        labelActions={[<ActionButton key="action" />]}
      >
        <ControlledTextInput name="form-section-actions" size={args.size} />
      </Form.Field>

      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="Kitchen sink"
        {...kitchenSinkProps}
      >
        <ControlledTextInput
          name="form-section-kitchen-sink"
          initialValue="Kitchen sink value"
          size={args.size}
          disabled
          invalid
        />
      </Form.Field>

      <Form.Field {...args} as="legend" layout="inline" label="Contact method">
        <ControlledRadioGroup
          name="form-section-contact-method"
          layout="inline"
          size={args.size}
        />
      </Form.Field>

      <Form.Field {...args} as="label" label="Block layout field">
        <ControlledTextInput name="form-section-block" size={args.size} />
      </Form.Field>

      <p className={sectionTextStyle}>
        Custom elements can sit between fields — they span the full width of the
        section and manage their own spacing.
      </p>

      <Form.Row className={sectionRowStyle}>
        <Form.Field {...args} as="label" label="First in row">
          <ControlledTextInput name="form-section-row-1" size={args.size} />
        </Form.Field>
        <Form.Field {...args} as="label" label="Second in row">
          <ControlledTextInput name="form-section-row-2" size={args.size} />
        </Form.Field>
      </Form.Row>

      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="After the row with very very long content"
      >
        <ControlledTextInput name="form-section-after-row" size={args.size} />
      </Form.Field>

      <Form.Field {...args} as="label" layout="inline" label="Short width">
        <ControlledTextInput
          name="form-section-last"
          size={args.size}
          width="sm"
        />
      </Form.Field>

      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="Input align end"
        inputAlign="end"
      >
        <ControlledTextInput
          name="form-section-last"
          size={args.size}
          width="sm"
        />
      </Form.Field>

      <Form.Field {...args} as="label" layout="inline" label="Last">
        <ControlledTextInput name="form-section-last" size={args.size} />
      </Form.Field>
    </Form.Section>
  </div>
);

const renderRowField = (
  args: FormFieldArgs,
  prefix: string,
  index: number,
  // layout/inputAlign are excluded: Partial flattens the union that ties
  // inputAlign to layout="inline", and no row story overrides them anyway
  overrides?: Partial<Omit<FormFieldArgs, "layout" | "inputAlign">> & {
    invalid?: boolean;
    connectToLeftInput?: boolean;
    connectToRightInput?: boolean;
  },
) => {
  const {
    invalid,
    connectToLeftInput,
    connectToRightInput,
    ...fieldOverrides
  } = overrides ?? {};
  return (
    <Form.Field
      {...args}
      label={`Field ${index + 1}`}
      {...fieldOverrides}
      key={`${prefix}-${index}`}
      as="label"
    >
      <ControlledTextInput
        name={`${prefix}-${index + 1}`}
        size={args.size}
        invalid={invalid}
        connectToLeftInput={connectToLeftInput}
        connectToRightInput={connectToRightInput}
      />
    </Form.Field>
  );
};

export const FormRowDefault: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    <Form.Row>
      {renderRowField(args, "form-row-default-single", 0, {
        label: "1 field",
      })}
    </Form.Row>

    <Form.Row>
      {renderRowField(args, "form-row-default-pair", 0, {
        label: "2 fields (second has no label)",
      })}
      {renderRowField(args, "form-row-default-pair", 1, { hideLabel: true })}
    </Form.Row>

    <Form.Row
      errors={
        <Errors
          errors={["Something is wrong with the values in this row"]}
          size={args.size}
        />
      }
    >
      {Array.from({ length: 4 }, (_, index) =>
        renderRowField(args, "form-row-default-quad", index, {
          invalid: true,
          ...(index === 0 ? { label: "4 fields with row errors" } : {}),
        }),
      )}
    </Form.Row>

    <Form.Row>
      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="3 inline fields (only first labelled)"
      >
        <ControlledTextInput
          name="form-row-default-inline-triple-1"
          size={args.size}
        />
      </Form.Field>
      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="Second field"
        hideLabel
      >
        <ControlledTextInput
          name="form-row-default-inline-triple-2"
          size={args.size}
        />
      </Form.Field>
      <Form.Field
        {...args}
        as="label"
        layout="inline"
        label="Third field"
        hideLabel
      >
        <ControlledTextInput
          name="form-row-default-inline-triple-3"
          size={args.size}
        />
      </Form.Field>
    </Form.Row>

    <Form.Row gap="lg">
      <Form.Field {...args} as="label" layout="inline" label="First inline">
        <ControlledTextInput
          name="form-row-default-inline-pair-1"
          size={args.size}
        />
      </Form.Field>
      <Form.Field {...args} as="label" layout="inline" label="Second inline">
        <ControlledTextInput
          name="form-row-default-inline-pair-2"
          size={args.size}
        />
      </Form.Field>
    </Form.Row>
  </div>
);

export const FormRowGap: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    {formRowGaps.map((gap) => (
      <Form.Row key={gap} gap={gap} noWrap={gap === "none"}>
        {Array.from({ length: 4 }, (_, index) =>
          renderRowField(args, `form-row-gap-${gap}`, index, {
            label: index === 0 ? `Gap: ${gap}` : "...",
            ...(gap === "none" && {
              connectToLeftInput: index > 0,
              connectToRightInput: index < 3,
            }),
          }),
        )}
      </Form.Row>
    ))}
  </div>
);

export const FormRowAlign: Story<FormFieldArgs> = (args) => (
  <div className={sectionStyle}>
    {formRowAligns.map((align) => (
      <Form.Row key={align} align={align}>
        {Array.from({ length: 4 }, (_, index) =>
          renderRowField(args, `form-row-align-${align}`, index, {
            hideLabel: index > 0,
            ...(index === 0 ? { label: `Align: ${align}` } : {}),
          }),
        )}
      </Form.Row>
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
    <Form.Field
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
    </Form.Field>
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
    <Form.Field
      as="label"
      label={label}
      description={description}
      size={size}
      required={required}
      errors={field.state.meta.errors}
    >
      <NumberInput
        name={field.name}
        value={field.state.value}
        min={min}
        max={max}
        onChange={(value) => field.handleChange(value ?? 0)}
        onBlur={field.handleBlur}
        size={size}
        invalid={field.state.meta.errors.length > 0}
      />
    </Form.Field>
  );
};

const CheckboxGroupField = ({
  label,
  description,
  size,
  required,
  items,
}: {
  label: string;
  description?: string;
  size?: FormInputSize;
  required?: boolean;
  items: React.ComponentProps<typeof CheckboxGroup>["items"];
}) => {
  const field = useFieldContext<string[]>();
  return (
    <Form.Field
      as="legend"
      label={label}
      description={description}
      size={size}
      required={required}
      errors={field.state.meta.errors}
    >
      <CheckboxGroup
        name={field.name}
        items={items}
        value={field.state.value}
        onChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
        size={size}
        invalid={field.state.meta.errors.length > 0}
      />
    </Form.Field>
  );
};

const RadioGroupField = ({
  label,
  description,
  size,
  required,
  items,
}: {
  label: string;
  description?: string;
  size?: FormInputSize;
  required?: boolean;
  items: React.ComponentProps<typeof RadioGroup>["items"];
}) => {
  const field = useFieldContext<string>();
  return (
    <Form.Field
      as="legend"
      label={label}
      description={description}
      size={size}
      required={required}
      errors={field.state.meta.errors}
    >
      <RadioGroup
        name={field.name}
        items={items}
        value={field.state.value}
        onChange={(value) => field.handleChange(value)}
        onBlur={field.handleBlur}
        size={size}
        invalid={field.state.meta.errors.length > 0}
      />
    </Form.Field>
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
  fieldComponents: {
    TextField,
    IntegerField,
    CheckboxGroupField,
    RadioGroupField,
  },
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
      interests: [] as string[],
      contactMethod: "",
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

      <form.AppField
        name="interests"
        validators={{
          onChange: ({ value }) =>
            value.length === 0 ? "Select at least one interest" : undefined,
        }}
      >
        {(field) => (
          <field.CheckboxGroupField
            label="Interests"
            size={args.size}
            required
            items={[
              { value: "design", label: "Design" },
              { value: "engineering", label: "Engineering" },
              { value: "research", label: "Research" },
            ]}
          />
        )}
      </form.AppField>

      <form.AppField
        name="contactMethod"
        validators={{
          onChange: ({ value }) =>
            value === "" ? "Select a contact method" : undefined,
        }}
      >
        {(field) => (
          <field.RadioGroupField
            label="Contact method"
            size={args.size}
            required
            items={[
              { value: "email", label: "Email" },
              { value: "phone", label: "Phone" },
              { value: "post", label: "Post" },
            ]}
          />
        )}
      </form.AppField>

      <form.AppForm>
        <form.SubmitButton size={args.size}>Submit</form.SubmitButton>
      </form.AppForm>
    </form>
  );
};
