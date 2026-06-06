import { Menu } from "@ark-ui/react/menu";

import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { type Item, type ItemOrGroup, SelectableList } from "./selectable-list";

import type { Story, StoryDefault } from "@ladle/react";

type SelectableListProps = React.ComponentProps<typeof SelectableList>;

const StaticMenu = ({ children }: { children: React.ReactNode }) => (
  <Menu.Root open closeOnSelect={false} composite>
    {children}
  </Menu.Root>
);

const tones = ["neutral", "brand", "error"] as const;
const selectedStyles = ["none", "tick", "checkbox", "highlight"] as const;

const noop = () => {};

const simpleItem: Item = {
  id: "simple",
  text: "Simple item",
  onClick: noop,
};

const itemWithDescription: Item = {
  id: "with-description",
  text: "Item with description",
  description: "Some helpful explanation underneath the main text",
  onClick: noop,
};

const itemWithIcon: Item = {
  id: "with-icon",
  text: "Item with icon",
  icon: "star",
  onClick: noop,
};

const itemWithLoading: Item = {
  id: "with-loading",
  text: "Loading item",
  loading: true,
  onClick: noop,
};

const itemIndent1: Item = {
  id: "indent-1",
  text: "Indented 1",
  indent: 1,
  onClick: noop,
};

const itemIndent2: Item = {
  id: "indent-2",
  text: "Indented 2",
  indent: 2,
  onClick: noop,
};

const toneItems: Item[] = tones.map((tone) => ({
  id: `tone-${tone}`,
  text: `Tone: ${tone}`,
  tone,
  onClick: noop,
}));

const selectedStyleVariantItems: Item[] = selectedStyles.flatMap((style) => [
  {
    id: `style-${style}-unselected`,
    text: `selectedStyle: ${style} (not selected)`,
    selectedStyle: style,
    onClick: noop,
  },
  {
    id: `style-${style}-selected`,
    text: `selectedStyle: ${style} (selected)`,
    selectedStyle: style,
    onClick: noop,
  },
]);

const itemWithHref: Item = {
  id: "with-href",
  text: "Link item (href)",
  href: "https://example.com",
  target: "_blank",
};

const itemWithCustomText: Item = {
  id: "with-custom-text",
  text: (
    <span
      className={css({
        fontStyle: "italic",
        fontWeight: "semibold",
        color: "red.s80",
        textDecoration: "underline",
      })}
    >
      Custom styled text
    </span>
  ),
  onClick: noop,
};

const kitchenSinkItem: Item = {
  id: "kitchen-sink",
  text: "Kitchen sink",
  description: "All the bells and whistles",
  icon: "warning",
  indent: 1,
  tone: "error",
  selectedStyle: "checkbox",
  onClick: noop,
};

export const defaultSelected = [
  ...selectedStyles.map((style) => `style-${style}-selected`),
  "kitchen-sink",
];

export const groupedItems: ItemOrGroup<Item>[] = [
  simpleItem,
  itemWithDescription,
  itemWithIcon,
  itemWithLoading,
  itemWithHref,
  {
    id: "group-indented",
    label: "Indented",
    items: [itemIndent1, itemIndent2],
  },
  {
    id: "group-tones",
    label: "Tone",
    items: toneItems,
  },
  {
    id: "group-selected",
    label: "Selected",
    items: selectedStyleVariantItems,
  },
  {
    id: "group-custom-label",
    label: (
      <span
        className={css({
          textTransform: "uppercase",
          letterSpacing: "[2px]",
          fontWeight: "semibold",
          color: "red.s80",
        })}
      >
        ✦ Custom group label ✦
      </span>
    ),
    items: [itemWithCustomText],
  },
  {
    id: "group-kitchen-sink",
    label: undefined,
    items: [kitchenSinkItem],
  },
];

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

const nestedItemSingleChild: Item = {
  id: "sa-single-child",
  text: "Sub-action",
  icon: "pencil",
  onClick: noop,
};

const nestedGroupedChildren: Item[] = [
  {
    id: "sa-grouped-1",
    text: "First sub-action",
    icon: "plus",
    onClick: noop,
  },
  {
    id: "sa-grouped-2",
    text: "Second sub-action",
    icon: "pencil",
    onClick: noop,
  },
  {
    id: "sa-grouped-3",
    text: "Disabled sub-action",
    disabled: true,
    onClick: noop,
  },
];

const nestedNestedGrandchild: Item = {
  id: "sa-nested-2",
  text: "Second level (nested)",
  onClick: noop,
};

const nestedNestedChild = {
  id: "sa-nested-1",
  text: "First level",
  icon: "arrowRight",
  onClick: noop,
  nestedItems: nestedNestedGrandchild,
} as unknown as Item;

const itemWithSingleSubAction = {
  id: "sa-single",
  text: "Item with a single sub-action",
  icon: "sliders",
  onClick: noop,
  nestedItems: nestedItemSingleChild,
} as unknown as Item;

const itemWithGroupedSubActions = {
  id: "sa-grouped",
  text: "Item with grouped sub-actions",
  icon: "magic",
  onClick: noop,
  nestedItems: {
    id: "sa-grouped-group",
    label: "Sub-action group",
    items: nestedGroupedChildren,
  },
} as unknown as Item;

const itemWithNestedSubActions = {
  id: "sa-nested",
  text: "Item with nested sub-actions",
  icon: "shapes",
  onClick: noop,
  nestedItems: nestedNestedChild,
} as unknown as Item;

const itemWithoutSubActions: Item = {
  id: "sa-plain",
  text: "Item without sub-actions",
  onClick: noop,
};

export const itemsWithSubActions: ItemOrGroup<Item>[] = [
  itemWithSingleSubAction,
  itemWithGroupedSubActions,
  itemWithNestedSubActions,
  itemWithoutSubActions,
];

export const WithSubActions: Story<SelectableListProps> = (args) => (
  <StaticMenu>
    <SelectableList {...args} items={itemsWithSubActions} />
  </StaticMenu>
);

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
          emptyState={
            <div
              className={css({
                padding: "[24px]",
                textAlign: "center",
                color: "neutral.s80",
                fontSize: "[14px]",
              })}
            >
              Nothing to show yet
            </div>
          }
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
