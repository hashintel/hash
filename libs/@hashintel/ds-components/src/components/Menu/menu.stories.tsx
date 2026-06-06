import { Button } from "../Button/button";
import {
  groupedItems,
  itemsWithSubActions,
} from "../SelectableList/selectable-list.fixtures";
import { EllipsisMenu as EllipsisMenuComponent } from "./ellipsis-menu";
import { Menu } from "./menu";

import type { Story, StoryDefault } from "@ladle/react";

type MenuProps = React.ComponentProps<typeof Menu>;

const positions = [
  "bottom",
  "bottom-start",
  "bottom-end",
  "top",
  "top-start",
  "top-end",
  "left",
  "left-start",
  "left-end",
  "right",
  "right-start",
  "right-end",
] as const;

export default {
  title: "Components/Menu",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    position: {
      control: { type: "select", options: positions },
    },
    loading: {
      control: { type: "boolean" },
    },
  },
  args: {
    position: "bottom-start",
    loading: false,
  },
} satisfies StoryDefault<MenuProps>;

export const Default: Story<MenuProps> = (args) => (
  <Menu
    {...args}
    trigger={<Button variant="solid">Open menu</Button>}
    items={groupedItems}
  />
);

export const Nested: Story<MenuProps> = (args) => (
  <Menu
    {...args}
    trigger={<Button variant="solid">Open nested menu</Button>}
    items={itemsWithSubActions}
  />
);

export const PlainButtonTrigger: Story<MenuProps> = (args) => (
  <Menu
    {...args}
    trigger={<button type="button">Open menu</button>}
    items={groupedItems}
  />
);

export const EllipsisMenu: Story<MenuProps> = (args) => (
  <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
    <EllipsisMenuComponent {...args} items={groupedItems} />
    <EllipsisMenuComponent
      {...args}
      items={groupedItems}
      iconName="bell"
      variant="solid"
      size="xs"
    />
    <EllipsisMenuComponent {...args} items={groupedItems} disabled />
  </div>
);
