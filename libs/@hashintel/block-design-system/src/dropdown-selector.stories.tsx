import type { Meta, StoryFn } from "@storybook/react";
import { useState } from "react";

import { DropdownSelector } from "./dropdown-selector";

const meta = {
  title: "Block Design System/Dropdown Selector",
  component: DropdownSelector,
  tags: ["docsPage"],
} satisfies Meta<typeof DropdownSelector>;

export default meta;
type Story = StoryFn<typeof meta>;

export const Defaults: Story = () => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("1");

  return (
    <DropdownSelector
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={[
        {
          id: "1",
          title: "Option 1",
          description: "The first option",
          icon: <div>1</div>,
        },
        {
          id: "2",
          title: "Option 2",
          description: "The second option",
          icon: <div>2</div>,
        },
      ]}
      value={value}
      onChange={(newValue) => setValue(newValue)}
    />
  );
};

export const Grouped: Story = () => {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("1.1");

  return (
    <DropdownSelector
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      options={{
        Group1: {
          name: "Group 1",
          options: [
            {
              id: "1.1",
              title: "Option 1.1",
              description: "The first option",
              icon: <div>1.1</div>,
            },
            {
              id: "1.2",
              title: "Option 2.1",
              description: "The second option",
              icon: <div>2.1</div>,
            },
          ],
        },
        Group2: {
          name: "Group 2",
          options: [
            {
              id: "2.1",
              title: "Option 2.1",
              description: "The first option",
              icon: <div>2.1</div>,
            },
          ],
        },
      }}
      value={value}
      onChange={(newValue) => setValue(newValue)}
    />
  );
};
