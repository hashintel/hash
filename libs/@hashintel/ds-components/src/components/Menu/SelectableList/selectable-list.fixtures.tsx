import { css } from "@hashintel/ds-helpers/css";

import { type Item, type ItemOrGroup } from "./selectable-list";

const tones = ["neutral", "brand", "error"] as const;
const selectedStyles = ["tick", "checkbox", "highlight"] as const;

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

const itemWithSuffix: Item = {
  id: "with-suffix",
  text: "Item with suffix",
  suffix: "⌘K",
  onClick: noop,
};

const itemKeepsMenuOpen: Item = {
  id: "keep-open",
  text: "Keeps menu open on click",
  keepOpenOnSelect: true,
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

const selectedStyleVariantItems: Item[] = selectedStyles.flatMap((style) => {
  const selected: Item = {
    id: `style-${style}-selected`,
    text: `selectedStyle: ${style} (selected)`,
    selectedStyle: style,
    onClick: noop,
  };

  if (style === "highlight") {
    return [selected];
  }

  return [
    {
      id: `style-${style}-unselected`,
      text: `selectedStyle: ${style} (not selected)`,
      selectedStyle: style,
      onClick: noop,
    },
    selected,
  ];
});

const highlightToneVariantItems: Item[] = (["brand", "error"] as const).map(
  (tone) => ({
    id: `style-highlight-${tone}-selected`,
    text: `selectedStyle: highlight, tone: ${tone} (selected)`,
    tone,
    selectedStyle: "highlight",
    onClick: noop,
  }),
);

const selectedToneVariantItems: Item[] = selectedStyles.map((style) => ({
  id: `selected-tone-${style}`,
  text: `selectedTone: brand, tone: neutral, ${style} (selected)`,
  selectedTone: "brand",
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
  suffix: "⌘K",
  onClick: noop,
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
  subItems: [nestedNestedGrandchild],
} as unknown as Item;

const itemWithSingleSubAction = {
  id: "sa-single",
  text: "Item with a single sub-action",
  icon: "sliders",
  onClick: noop,
  subItems: [nestedItemSingleChild],
} as unknown as Item;

const itemWithGroupedSubActions = {
  id: "sa-grouped",
  text: "Item with grouped sub-actions",
  icon: "magic",
  onClick: noop,
  subItems: [
    {
      id: "sa-grouped-group",
      label: "Sub-action group",
      items: nestedGroupedChildren,
    },
  ],
} as unknown as Item;

const itemWithNestedSubActions = {
  id: "sa-nested",
  text: "Item with nested sub-actions",
  icon: "shapes",
  onClick: noop,
  subItems: [nestedNestedChild],
} as unknown as Item;

const itemWithoutSubActions: Item = {
  id: "sa-plain",
  text: "Item without sub-actions",
  onClick: noop,
};

export const defaultSelected = [
  ...selectedStyles.map((style) => `style-${style}-selected`),
  "style-highlight-brand-selected",
  "style-highlight-error-selected",
  ...selectedStyles.map((style) => `selected-tone-${style}`),
  "kitchen-sink",
];

export const groupedItems: ItemOrGroup<Item>[] = [
  simpleItem,
  itemWithDescription,
  itemWithIcon,
  itemWithLoading,
  itemWithSuffix,
  itemKeepsMenuOpen,
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
    items: [
      ...selectedStyleVariantItems,
      ...highlightToneVariantItems,
      ...selectedToneVariantItems,
    ],
  },
  {
    id: "group-nested-items",
    label: "nested items",
    items: [
      itemWithSingleSubAction,
      itemWithGroupedSubActions,
      itemWithNestedSubActions,
    ],
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

export const itemsWithSubActions: ItemOrGroup<Item>[] = [
  itemWithSingleSubAction,
  itemWithGroupedSubActions,
  itemWithNestedSubActions,
  itemWithoutSubActions,
];

const customButtonStyle = css({
  textStyle: "xs",
  paddingX: "2",
  paddingY: "0.5",
  border: "1px solid {colors.bd.subtle}",
  borderRadius: "md",
  backgroundColor: "white",
  cursor: "pointer",
  "&:hover": {
    backgroundColor: "neutral.a25",
  },
});

// No `id`: exercises the internal positional fallback id.
const customItemWithInput: Item = {
  custom: (
    <input
      type="text"
      placeholder="Focusable input…"
      className={css({
        width: "full",
        border: "1px solid {colors.bd.subtle}",
        borderRadius: "md",
        paddingX: "1.5",
        paddingY: "0.5",
      })}
    />
  ),
};

const customItemWithButtons: Item = {
  id: "custom-buttons",
  custom: (
    <div className={css({ display: "flex", gap: "1.5" })}>
      <button type="button" className={customButtonStyle} onClick={noop}>
        Select all
      </button>
      <button type="button" className={customButtonStyle} onClick={noop}>
        Clear
      </button>
    </div>
  ),
};

// No `id`: exercises the internal positional fallback id.
const customItemHint: Item = {
  custom: (
    <span className={css({ color: "fg.subtle", fontSize: "[0.85em]" })}>
      A non-focusable hint between items
    </span>
  ),
};

const customItemFooter: Item = {
  id: "custom-footer",
  custom: (
    <span className={css({ color: "fg.subtle", fontSize: "[0.85em]" })}>
      Non-focusable footer note
    </span>
  ),
};

export const itemsWithCustomRows: ItemOrGroup<Item>[] = [
  customItemWithInput,
  { id: "custom-regular-1", text: "First regular item", onClick: noop },
  { id: "custom-regular-2", text: "Second regular item", onClick: noop },
  customItemWithButtons,
  customItemHint,
  { id: "custom-regular-3", text: "Third regular item", onClick: noop },
  { id: "custom-regular-4", text: "Fourth regular item", onClick: noop },
  customItemFooter,
];
