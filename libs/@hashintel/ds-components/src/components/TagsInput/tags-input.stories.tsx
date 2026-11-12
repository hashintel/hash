import { Fragment, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { TagsInput } from "./tags-input";

import type { Meta, StoryObj } from "@storybook/react-vite";

type TagsInputProps = React.ComponentProps<typeof TagsInput>;
type Variant = NonNullable<TagsInputProps["variant"]>;

const variants = ["default", "subtle"] as const satisfies readonly Variant[];

const sampleValues = ["Apple", "Banana", "Cherry"];
const manyValues = [
  "Apple",
  "Banana",
  "Cherry",
  "Dragonfruit",
  "Elderberry",
  "Fig",
  "Grape",
  "Honeydew",
];

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[32px]",
  background: "neutral.s10",
});

const groupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[12px]",
});

const headingStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  textTransform: "capitalize",
  margin: 0,
};

const subheadingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#666",
};

const Controlled = ({
  value: initialValue,
  ...props
}: Omit<TagsInputProps, "value" | "onChange"> & { value?: string[] }) => {
  const [value, setValue] = useState<string[]>(initialValue ?? []);
  return <TagsInput {...props} value={value} onChange={setValue} />;
};

const kitchenSinkProps = {
  prefix: { iconName: "search" },
  suffix: { text: "fruits" },
  clearable: true,
  loading: true,
} satisfies Partial<TagsInputProps>;

type StateExample = {
  /** Example width in pixels; narrow enough that the overflow modes engage. */
  width?: number;
  props: Partial<Omit<TagsInputProps, "value" | "onChange">> & {
    value: string[];
  };
};

type StateRow = {
  key: string;
  label: string;
  examples: StateExample[];
};

const stateRows: StateRow[] = [
  { key: "empty", label: "Empty", examples: [{ props: { value: [] } }] },
  {
    key: "values",
    label: "With values",
    examples: [{ props: { value: sampleValues } }],
  },
  {
    key: "duplicates",
    label: "allowDuplicates",
    examples: [
      {
        props: {
          value: ["Apple", "Apple", "Banana"],
          allowDuplicates: true,
        },
      },
    ],
  },
  {
    key: "disabled",
    label: "Disabled",
    examples: [{ props: { value: sampleValues, disabled: true } }],
  },
  {
    key: "invalid",
    label: "Invalid",
    examples: [{ props: { value: sampleValues, invalid: true } }],
  },
  {
    key: "loading",
    label: "Loading",
    examples: [{ props: { value: sampleValues, loading: true } }],
  },
  {
    key: "clearable",
    label: "Clearable",
    examples: [{ props: { value: sampleValues, clearable: true } }],
  },
  {
    key: "placeholder",
    label: "Placeholder",
    examples: [{ props: { value: [], placeholder: "Add a fruit…" } }],
  },
  {
    key: "readonly",
    label: "Readonly",
    examples: [{ props: { value: sampleValues, readonly: true } }],
  },
  {
    key: "custom-render",
    label: "renderSelectedItem / renderSelectedAll",
    examples: [
      {
        width: 280,
        props: {
          value: sampleValues,
          renderSelectedItem: (value) => <em>🍎 {value}</em>,
        },
      },
      {
        width: 280,
        props: {
          value: sampleValues,
          renderSelectedAll: (values) => (
            <strong>
              {values.length} fruit{values.length === 1 ? "" : "s"}
            </strong>
          ),
        },
      },
    ],
  },
  {
    key: "overflow",
    label: "Overflow: scroll / truncate / summary",
    examples: [
      { width: 280, props: { value: manyValues, overflow: "scroll" } },
      { width: 280, props: { value: manyValues, overflow: "truncate" } },
      { width: 280, props: { value: manyValues, overflow: "summary" } },
    ],
  },
  {
    key: "kitchen-sink",
    label: "Kitchen sink",
    examples: [{ props: { value: manyValues, ...kitchenSinkProps } }],
  },
];

const meta = {
  title: "Components/TagsInput",
  component: TagsInput,
  args: {
    variant: "default",
    size: "md",
    width: "fullWidth",
  },
} satisfies Meta<TagsInputProps>;

export default meta;

type Story = StoryObj<TagsInputProps>;

export const Default: Story = {
  render: (args: TagsInputProps) => (
    <div className={sectionStyle}>
      {variants.map((variant) => (
        <div key={variant} className={groupStyle}>
          <h3 style={headingStyle}>{variant}</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "150px minmax(0, 880px)",
              columnGap: 16,
              rowGap: 12,
              alignItems: "center",
            }}
          >
            {stateRows.map((row) => (
              <Fragment key={row.key}>
                <span style={subheadingStyle}>{row.label}</span>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {row.examples.map((example, exampleIndex) => (
                    <div
                      // eslint-disable-next-line react/no-array-index-key
                      key={exampleIndex}
                      style={{ width: example.width ?? 480, flex: "none" }}
                    >
                      <Controlled
                        {...args}
                        variant={variant}
                        {...example.props}
                      />
                    </div>
                  ))}
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args: TagsInputProps) => (
    <div className={sectionStyle}>
      {formInputSizes.map((size) => (
        <div key={size} className={groupStyle}>
          <h3 style={headingStyle}>{size}</h3>
          <Controlled
            {...args}
            size={size}
            value={manyValues}
            {...kitchenSinkProps}
          />
        </div>
      ))}
    </div>
  ),
};
