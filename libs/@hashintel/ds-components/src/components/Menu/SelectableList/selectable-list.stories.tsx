import { Menu } from "@ark-ui/react/menu";
import { useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../../util/form-shared";
import { type Item, type ItemOrGroup, SelectableList } from "./selectable-list";
import { SelectableListSearch } from "./selectable-list-search";
import { SelectableListSelectionSummary } from "./selectable-list-selection-summary";
import {
  defaultSelected,
  demoFooter,
  demoHeader,
  groupedItems,
  itemsWithCustomRows,
  simpleItem,
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
    <SelectableList
      {...args}
      items={groupedItems}
      selected={defaultSelected}
      header={demoHeader}
      footer={demoFooter}
    />
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

const searchableFruits = [
  "Apple",
  "Banana",
  "Cherry",
  "Dragonfruit",
  "Elderberry",
  "Fig",
  "Grape",
  "Honeydew",
];

export const SearchWithSelectionSummary: Story<SelectableListProps> = (
  args,
) => {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(["Apple", "Cherry"]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id],
    );

  const visibleFruits = searchableFruits.filter((fruit) =>
    fruit.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <StaticMenu>
      <SelectableList
        {...args}
        items={visibleFruits.map((fruit) => ({
          id: fruit,
          text: fruit,
          selectedStyle: "checkbox",
          onClick: toggle,
        }))}
        selected={selected}
        emptyState={<span>No matches</span>}
        header={
          <SelectableListSearch
            value={search}
            onChange={setSearch}
            aria-label="Search fruits"
          />
        }
        footer={
          <SelectableListSelectionSummary
            size={args.size}
            selectedCount={selected.length}
            totalCount={searchableFruits.length}
            onSelectAll={() => setSelected(searchableFruits)}
            onClearAll={() => setSelected([])}
          />
        }
      />
    </StaticMenu>
  );
};

export const Disabled: Story<SelectableListProps> = (args) => (
  <StaticMenu>
    <SelectableList
      {...args}
      items={disabledGroupedItems}
      selected={disabledSelected}
      header={demoHeader}
      footer={demoFooter}
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
              header={demoHeader}
              footer={demoFooter}
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
            single item
          </span>
          <StaticMenu>
            <SelectableList
              {...args}
              size={size}
              items={[prefixIds(simpleItem, size)]}
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
