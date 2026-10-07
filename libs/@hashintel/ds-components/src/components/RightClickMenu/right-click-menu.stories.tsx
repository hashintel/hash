import { useMemo } from "react";

import {
  type Item,
  type ItemOrGroup,
} from "../../util/SelectableList/selectable-list";
import { getItemId } from "../../util/SelectableList/selectable-list-util";
import {
  defaultSelected,
  groupedItems,
} from "../../util/SelectableList/selectable-list.fixtures";
import { type MenuItem } from "../Menu/menu";
import { RightClickMenu } from "./right-click-menu";

import type { Meta, StoryObj } from "@storybook/react-vite";

type RightClickMenuProps = React.ComponentProps<typeof RightClickMenu>;

const meta = {
  title: "Components/RightClickMenu",
  component: RightClickMenu,
  args: {
    position: "bottom-start",
  },
} satisfies Meta<RightClickMenuProps>;

export default meta;

type Story = StoryObj<RightClickMenuProps>;

const dropTargetStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 320,
  height: 160,
  border: "2px dashed currentColor",
  borderRadius: 8,
  userSelect: "none",
};

function withSelectedFlags(entry: ItemOrGroup<Item>): ItemOrGroup<MenuItem> {
  if ("items" in entry) {
    return {
      ...entry,
      items: entry.items.map((item) => withSelectedFlags(item) as MenuItem),
    };
  }
  if ("custom" in entry) {
    return entry;
  }
  return {
    ...entry,
    selected: defaultSelected.includes(getItemId(entry)),
  };
}

const DefaultDemo = (args: RightClickMenuProps) => {
  const items = useMemo(() => groupedItems.map(withSelectedFlags), []);
  return (
    <RightClickMenu {...args} items={items}>
      <div style={dropTargetStyle}>Right click anywhere in this area</div>
    </RightClickMenu>
  );
};

export const Default: Story = {
  render: (args) => <DefaultDemo {...args} />,
};
