import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { CheckboxGroup } from "./checkbox-group";

import type { Story, StoryDefault } from "@ladle/react";

type Props = React.ComponentProps<typeof CheckboxGroup>;

const layouts: NonNullable<Props["layout"]>[] = [
  "blockWithBorder",
  "block",
  "inline",
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

const ControlledCheckboxGroup = ({
  defaultValue = ["apple"],
  ...props
}: Omit<Props, "value" | "onChange" | "items"> & {
  defaultValue?: string[];
  items?: Props["items"];
}) => {
  const [value, setValue] = useState(defaultValue);
  return (
    <CheckboxGroup
      {...props}
      items={props.items ?? fruitItems}
      value={value}
      onChange={setValue}
    />
  );
};

export default {
  title: "Components/CheckboxGroup",
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

const subHeadingClass = css({
  fontSize: "[11px]",
  color: "neutral.s70",
  marginBottom: "[6px]",
});

const layoutRowClass = css({
  display: "flex",
  gap: "[40px]",
  alignItems: "flex-start",
  flexWrap: "wrap",
});

export const Layouts: Story = () => (
  <div className={sectionClass}>
    {layouts.map((layout) => (
      <div key={layout}>
        <div className={headingClass}>layout={layout}</div>
        <ControlledCheckboxGroup
          layout={layout}
          defaultValue={["apple", "cherry"]}
        />
      </div>
    ))}
    <div>
      <div className={headingClass}>
        layout=blockWithBorder, labelPlacement=left
      </div>
      <ControlledCheckboxGroup
        layout="blockWithBorder"
        items={leftLabelItems}
      />
    </div>
    <div>
      <div className={headingClass}>layout=block, labelPlacement=left</div>
      <ControlledCheckboxGroup layout="block" items={leftLabelItems} />
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
        <div className={layoutRowClass}>
          {layouts.map((layout) => (
            <div key={layout}>
              <div className={subHeadingClass}>{layout}</div>
              <ControlledCheckboxGroup layout={layout} size={size} />
            </div>
          ))}
        </div>
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
      <ControlledCheckboxGroup disabled defaultValue={["apple"]} />
    </div>
    <div>
      <div className={headingClass}>single option disabled</div>
      <ControlledCheckboxGroup
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
