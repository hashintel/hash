import { Button } from "../Button/button";
import {
  groupedItems,
  itemsWithSubActions,
} from "../SelectableList/selectable-list.fixtures";
import { EllipsisMenu as EllipsisMenuComponent } from "./ellipsis-menu";
import { Menu } from "./menu";

import type { Item, ItemOrGroup } from "../SelectableList/selectable-list";
import type { Story, StoryDefault } from "@ladle/react";

function prefixIds(
  entry: ItemOrGroup<Item>,
  prefix: string,
): ItemOrGroup<Item> {
  if ("items" in entry) {
    return {
      ...entry,
      id: `${prefix}-${entry.id}`,
      items: entry.items.map((item) => prefixIds(item, prefix) as Item),
    };
  }
  const nested = (entry as { nestedItems?: ItemOrGroup<Item> }).nestedItems;
  return {
    ...entry,
    id: `${prefix}-${entry.id}`,
    ...(nested ? { nestedItems: prefixIds(nested, prefix) } : {}),
  } as unknown as Item;
}

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
  },
  args: {
    position: "bottom-start",
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
    <EllipsisMenuComponent
      {...args}
      items={groupedItems.map((entry) => prefixIds(entry, "ellipsis"))}
    />
    <EllipsisMenuComponent
      {...args}
      items={groupedItems.map((entry) => prefixIds(entry, "bell"))}
      iconName="bell"
      variant="solid"
      size="xs"
    />
    <EllipsisMenuComponent
      {...args}
      items={groupedItems.map((entry) => prefixIds(entry, "disabled"))}
      disabled
    />
  </div>
);
