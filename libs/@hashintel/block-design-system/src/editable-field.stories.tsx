import type { Meta, StoryFn } from "@storybook/react";
import { useState } from "react";

import { EditableField } from "./editable-field";

const meta = {
  title: "Block Design System/Editable Field",
  component: EditableField,
  tags: ["docsPage"],
} satisfies Meta<typeof EditableField>;

export default meta;
type Story = StoryFn<typeof meta>;

export const Defaults: Story = () => {
  const [value, setValue] = useState("");

  return (
    <EditableField
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder="Placeholder"
    />
  );
};

export const ReadOnly = () => {
  return <EditableField value="Value" readonly />;
};
