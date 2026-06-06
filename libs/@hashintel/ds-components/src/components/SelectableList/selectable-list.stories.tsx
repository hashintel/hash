import { Menu } from "@ark-ui/react/menu";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { type Item, type ItemOrGroup, SelectableList } from "./selectable-list";
import { defaultSelected, groupedItems } from "./selectable-list.fixtures";

import type { Story, StoryDefault } from "@ladle/react";

type SelectableListProps = React.ComponentProps<typeof SelectableList>;

const StaticMenu = ({ children }: { children: React.ReactNode }) => (
  <Menu.Root open closeOnSelect={false} composite>
    {children}
  </Menu.Root>
);

const withDisabled = (entry: ItemOrGroup<Item>): ItemOrGroup<Item> => {
  if ("items" in entry) {
    return {
      ...entry,
      id: `disabled-${entry.id}`,
      items: entry.items.map(
        (item) =>
          ({
            ...item,
            id: `disabled-${item.id}`,
            disabled: true,
          }) as unknown as Item,
      ),
    };
  }
  return {
    ...entry,
    id: `disabled-${entry.id}`,
    disabled: true,
  } as unknown as Item;
};

const disabledGroupedItems: ItemOrGroup<Item>[] =
  groupedItems.map(withDisabled);

const disabledSelected = defaultSelected.map((id) => `disabled-${id}`);

export default {
  title: "Components/SelectableList",
  parameters: {
    layout: "centered",
  },
  argTypes: {
    size: {
      control: {
        type: "select",
        options: formInputSizes,
      },
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
          gap: "[8px]",
          minWidth: "[240px]",
        })}
      >
        <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
          {size}
        </span>
        <StaticMenu>
          <SelectableList
            {...args}
            size={size}
            items={groupedItems}
            selected={defaultSelected}
          />
        </StaticMenu>
      </div>
    ))}
  </div>
);
Sizes.parameters = {
  controls: { exclude: ["size"] },
};

export const EmptyAndLoading: Story<SelectableListProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[32px]",
      alignItems: "flex-start",
      flexWrap: "wrap",
    })}
  >
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "[8px]",
        minWidth: "[240px]",
      })}
    >
      <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
        items=[] (no emptyState)
      </span>
      <StaticMenu>
        <SelectableList {...args} items={[]} />
      </StaticMenu>
    </div>
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "[8px]",
        minWidth: "[240px]",
      })}
    >
      <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
        items=[] with emptyState
      </span>
      <StaticMenu>
        <SelectableList
          {...args}
          items={[]}
          emptyState={<div>Nothing to show yet</div>}
        />
      </StaticMenu>
    </div>
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "[8px]",
        minWidth: "[240px]",
      })}
    >
      <span className={css({ fontSize: "[12px]", color: "neutral.s80" })}>
        loading=true
      </span>
      <StaticMenu>
        <SelectableList {...args} items={[]} loading />
      </StaticMenu>
    </div>
  </div>
);
