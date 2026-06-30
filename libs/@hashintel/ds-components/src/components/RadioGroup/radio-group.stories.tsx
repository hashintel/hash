import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { RadioGroup } from "./radio-group";

import type { Story, StoryDefault } from "@ladle/react";

type Props = React.ComponentProps<typeof RadioGroup>;

const layouts: NonNullable<Props["layout"]>[] = [
  "block",
  "inline",
  "blockWithBorder",
];

const fruitItems = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

const leftLabelItems = fruitItems.map((item) => ({
  ...item,
  labelPlacement: "left" as const,
}));

const ControlledRadioGroup = ({
  defaultValue = "apple",
  ...props
}: Omit<Props, "value" | "onChange" | "items"> & {
  defaultValue?: string;
  items?: Props["items"];
}) => {
  const [value, setValue] = useState(defaultValue);
  return (
    <RadioGroup
      {...props}
      items={props.items ?? fruitItems}
      value={value}
      onChange={setValue}
    />
  );
};

export default {
  title: "Components/RadioGroup",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    layout: { control: { type: "select", options: layouts } },
    size: { control: { type: "select", options: formInputSizes } },
    disabled: { control: { type: "boolean" } },
  },
  args: {
    layout: "block",
    size: "md",
    disabled: false,
  },
} satisfies StoryDefault<Props>;

const headingClass = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s90",
  marginBottom: "[8px]",
});

const sectionClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "[24px]",
});

export const Layouts: Story = () => (
  <div className={sectionClass}>
    {layouts.map((layout) => (
      <div key={layout}>
        <div className={headingClass}>layout={layout}</div>
        <ControlledRadioGroup layout={layout} />
      </div>
    ))}
    <div>
      <div className={headingClass}>layout=block, labelPlacement=left</div>
      <ControlledRadioGroup layout="block" items={leftLabelItems} />
    </div>
    <div>
      <div className={headingClass}>
        layout=blockWithBorder, labelPlacement=left
      </div>
      <ControlledRadioGroup layout="blockWithBorder" items={leftLabelItems} />
    </div>
  </div>
);

Layouts.parameters = {
  controls: { disable: true },
};

export const Sizes: Story = () => (
  <div className={sectionClass}>
    {formInputSizes.map((size) => (
      <div key={size}>
        <div className={headingClass}>size={size}</div>
        <ControlledRadioGroup layout="inline" size={size} />
      </div>
    ))}
  </div>
);

Sizes.parameters = {
  controls: { disable: true },
};

export const Disabled: Story = () => (
  <div className={sectionClass}>
    <div>
      <div className={headingClass}>whole group disabled</div>
      <ControlledRadioGroup disabled />
    </div>
    <div>
      <div className={headingClass}>single option disabled</div>
      <ControlledRadioGroup
        items={[
          { value: "apple", label: "Apple" },
          { value: "banana", label: "Banana", disabled: true },
          { value: "cherry", label: "Cherry" },
        ]}
      />
    </div>
  </div>
);

Disabled.parameters = {
  controls: { disable: true },
};
