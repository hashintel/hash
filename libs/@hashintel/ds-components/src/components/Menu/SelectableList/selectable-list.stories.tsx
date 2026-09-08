import { Menu } from "@ark-ui/react/menu";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../../util/form-shared";
import { type Item, type ItemOrGroup, SelectableList } from "./selectable-list";
import {
  defaultSelected,
  groupedItems,
  itemsWithCustomRows,
} from "./selectable-list.fixtures";

import type { Story, StoryDefault } from "@ladle/react";

type SelectableListProps = React.ComponentProps<typeof SelectableList>;

const StaticMenu = ({ children }: { children: React.ReactNode }) => (
  <Menu.Root open closeOnSelect={false} composite>
    {children}
  </Menu.Root>
);

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
  const nested = (entry as { subItems?: Array<ItemOrGroup<Item>> }).subItems;
  return {
    ...entry,
    id: `${prefix}-${entry.id}`,
    ...(nested
      ? { subItems: nested.map((child) => prefixIds(child, prefix)) }
      : {}),
  } as unknown as Item;
}

function withDisabled(entry: ItemOrGroup<Item>): ItemOrGroup<Item> {
  if ("items" in entry) {
    return {
      ...entry,
      id: `disabled-${entry.id}`,
      items: entry.items.map((item) => withDisabled(item) as Item),
    };
  }
  const nested = (entry as { subItems?: Array<ItemOrGroup<Item>> }).subItems;
  return {
    ...entry,
    id: `disabled-${entry.id}`,
    disabled: true,
    ...(nested ? { subItems: nested.map((child) => withDisabled(child)) } : {}),
  } as unknown as Item;
}

const disabledGroupedItems: ItemOrGroup<Item>[] =
  groupedItems.map(withDisabled);

const disabledSelected = defaultSelected.map((id) => `disabled-${id}`);

export default {
  title: "Internal/SelectableList",
  argTypes: {
    size: {
      control: { type: "select" },
      options: formInputSizes,
    },
  },
  args: {
    size: "md",
  },
} satisfies StoryDefault<SelectableListProps>;

export const Default: Story<SelectableListProps> = (args) => (
  <StaticMenu>
    <SelectableList {...args} items={groupedItems} selected={defaultSelected} />
  </StaticMenu>
);

export const CustomItems: Story<SelectableListProps> = (args) => (
  <div
    className={css({
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "[12px]",
    })}
  >
    <button type="button">Tabbable before the list</button>
    <StaticMenu>
      <SelectableList {...args} items={itemsWithCustomRows} />
    </StaticMenu>
    <button type="button">Tabbable after the list</button>
  </div>
);

export const HeaderAndFooter: Story<SelectableListProps> = (args) => (
  <div
    className={css({
      // The static menu has no positioner to set --available-height, so
      // provide it here — short enough that the items must scroll, showing
      // the header and footer stay pinned outside the scroll area (but tall
      // enough for the scroll area's 200px floor).
      "--available-height": "320px",
    })}
  >
    <StaticMenu>
      <SelectableList
        {...args}
        items={groupedItems}
        selected={defaultSelected}
        header={
          // The slots are undecorated; dividers are the consumer's to draw.
          // For an edge-to-edge one, pull out of the slot AND content padding
          // with the list's padding vars, re-applying them as own padding.
          <span
            className={css({
              display: "block",
              marginX:
                "[calc(-1 * (var(--selectable-list-padding-x) + var(--selectable-list-content-padding)))]",
              marginBottom: "[calc(-1 * var(--selectable-list-padding-y))]",
              paddingX:
                "[calc(var(--selectable-list-padding-x) + var(--selectable-list-content-padding))]",
              paddingBottom: "[var(--selectable-list-padding-y)]",
              borderBottom: "1px solid {colors.neutral.s30}",
            })}
          >
            Header — outside the scroll area
          </span>
        }
        footer={
          <span
            className={css({
              display: "block",
              marginX:
                "[calc(-1 * (var(--selectable-list-padding-x) + var(--selectable-list-content-padding)))]",
              marginTop: "[calc(-1 * var(--selectable-list-padding-y))]",
              paddingX:
                "[calc(var(--selectable-list-padding-x) + var(--selectable-list-content-padding))]",
              paddingTop: "[var(--selectable-list-padding-y)]",
              borderTop: "1px solid {colors.neutral.s30}",
            })}
          >
            Footer — outside the scroll area
          </span>
        }
      />
    </StaticMenu>
  </div>
);

export const Disabled: Story<SelectableListProps> = (args) => (
  <StaticMenu>
    <SelectableList
      {...args}
      items={disabledGroupedItems}
      selected={disabledSelected}
    />
  </StaticMenu>
);

export const Sizes: Story<SelectableListProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[24px]",
      alignItems: "flex-start",
      flexWrap: "wrap",
    })}
  >
    {formInputSizes.map((size) => (
      <div
        key={size}
        className={css({
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: "[16px]",
          minWidth: "[240px]",
        })}
      >
        <span
          className={css({
            fontSize: "[12px]",
            color: "neutral.s80",
            fontWeight: "medium",
          })}
        >
          {size}
        </span>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "[8px]",
          })}
        >
          <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
            items
          </span>
          <StaticMenu>
            <SelectableList
              {...args}
              size={size}
              items={groupedItems.map((entry) => prefixIds(entry, size))}
              selected={defaultSelected.map((id) => `${size}-${id}`)}
            />
          </StaticMenu>
        </div>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "[8px]",
          })}
        >
          <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
            items=[] (no emptyState)
          </span>
          <StaticMenu>
            <SelectableList {...args} size={size} items={[]} />
          </StaticMenu>
        </div>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "[8px]",
          })}
        >
          <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
            items=[] with emptyState
          </span>
          <StaticMenu>
            <SelectableList
              {...args}
              size={size}
              items={[]}
              emptyState={<div>Nothing to show yet</div>}
            />
          </StaticMenu>
        </div>
      </div>
    ))}
  </div>
);
