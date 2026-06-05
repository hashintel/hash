import { css } from "@hashintel/ds-helpers/css";

import { formInputSizes } from "../../util/form-shared";
import { type Item, type ItemOrGroup, SelectableList } from "./selectable-list";

import type { Story, StoryDefault } from "@ladle/react";

type SelectableListProps = React.ComponentProps<typeof SelectableList>;

const tones = ["neutral", "brand", "error"] as const;
const selectedStyles = [
  "none",
  "tick",
  "checkbox",
  "radio",
  "highlight",
] as const;

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

const disabledItem: Item = {
  id: "disabled",
  text: "Disabled item",
  disabled: true,
  onClick: noop,
};

const toneItems: Item[] = tones.map((tone) => ({
  id: `tone-${tone}`,
  text: `Tone: ${tone}`,
  tone,
  onClick: noop,
}));

const selectedStyleItems: Item[] = selectedStyles.map((style) => ({
  id: `style-${style}`,
  text: `Selected style: ${style}`,
  selectedStyle: style,
  onClick: noop,
}));

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

const allItems: Item[] = [
  simpleItem,
  itemWithDescription,
  itemWithIcon,
  itemWithLoading,
  itemIndent1,
  itemIndent2,
  disabledItem,
  ...toneItems,
  ...selectedStyleItems,
  itemWithHref,
  itemWithCustomText,
  kitchenSinkItem,
];

const defaultSelected = [
  "style-tick",
  "style-checkbox",
  "style-radio",
  "style-highlight",
  "kitchen-sink",
];

const noGroupItems = allItems.slice(0, 5);
const simpleLabelItems = allItems.slice(5, 9);
const customLabelItems = allItems.slice(9, 14);
const noLabelItems = allItems.slice(14, 18);

const groupedItems: ItemOrGroup[] = [
  ...noGroupItems,
  {
    id: "group-simple-label",
    label: "Simple group label",
    items: simpleLabelItems,
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
    items: customLabelItems,
  },
  {
    id: "group-no-label",
    label: undefined,
    items: noLabelItems,
  },
];

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
  <SelectableList {...args} items={groupedItems} selected={defaultSelected} />
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
        <SelectableList
          {...args}
          size={size}
          items={groupedItems}
          selected={defaultSelected}
        />
      </div>
    ))}
  </div>
);
Sizes.parameters = {
  controls: { exclude: ["size"] },
};

const itemsWithSubActions: ItemOrGroup[] = [
  {
    id: "sa-single",
    text: "Item with a single sub-action",
    icon: "sliders",
    onClick: noop,
    nestedItems: {
      id: "sa-single-child",
      text: "Sub-action",
      icon: "pencil",
      onClick: noop,
    },
  },
  {
    id: "sa-grouped",
    text: "Item with grouped sub-actions",
    icon: "magic",
    onClick: noop,
    nestedItems: {
      id: "sa-grouped-group",
      label: "Sub-action group",
      items: [
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
      ],
    },
  },
  {
    id: "sa-nested",
    text: "Item with nested sub-actions",
    icon: "shapes",
    onClick: noop,
    nestedItems: {
      id: "sa-nested-1",
      text: "First level",
      icon: "arrowRight",
      onClick: noop,
      nestedItems: {
        id: "sa-nested-2",
        text: "Second level (nested)",
        onClick: noop,
      },
    },
  },
  {
    id: "sa-plain",
    text: "Item without sub-actions",
    onClick: noop,
  },
];

export const WithSubActions: Story<SelectableListProps> = (args) => (
  <SelectableList {...args} items={itemsWithSubActions} />
);

export const Empty: Story<SelectableListProps> = (args) => (
  <div
    className={css({
      display: "flex",
      gap: "[32px]",
      alignItems: "flex-start",
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
      <SelectableList {...args} items={[]} />
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
    </div>
  </div>
);
