import { useCallback, useMemo, useState } from "react";

import { getItemId } from "../../primitives/SelectableList/selectable-list-util";
import {
  defaultSelected,
  groupedItems,
  itemsWithSubActions,
} from "../../primitives/SelectableList/selectable-list.fixtures";
import { Button } from "../Button/button";
import { EllipsisMenu as EllipsisMenuComponent } from "./ellipsis-menu";
import { Menu, type MenuItem } from "./menu";

import type {
  Item,
  ItemOrGroup,
} from "../../primitives/SelectableList/selectable-list";
import type { Meta, StoryObj } from "@storybook/react-vite";

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

/**
 * Recursively rewires items so that selecting any leaf (non-`href`,
 * non-`subItems` parent) toggles its id via the provided callback
 * and reflects the current selection state via the `selected` flag.
 * Items close the menu on click as usual, except the "Selected" group's
 * items (whose toggling the demo shows in place) and any item that sets
 * `keepOpenOnSelect` itself.
 */
function withSelection(
  entry: ItemOrGroup<Item>,
  selected: string[],
  toggle: (id: string) => void,
  keepOpen = false,
): ItemOrGroup<MenuItem> {
  if ("items" in entry) {
    return {
      ...entry,
      items: entry.items.map(
        (item) =>
          withSelection(
            item,
            selected,
            toggle,
            keepOpen || entry.id.endsWith("group-selected"),
          ) as MenuItem,
      ),
    };
  }
  if ("custom" in entry) {
    return entry as MenuItem;
  }
  const nested = (entry as { subItems?: Array<ItemOrGroup<Item>> }).subItems;
  if (nested) {
    return {
      ...entry,
      subItems: nested.map((child) =>
        withSelection(child, selected, toggle, keepOpen),
      ),
    } as unknown as MenuItem;
  }
  if ("href" in entry && entry.href) {
    return entry;
  }
  return {
    ...entry,
    onClick: toggle,
    ...(keepOpen ? { keepOpenOnSelect: true } : {}),
    selected: selected.includes(getItemId(entry)),
  } as MenuItem;
}

function useToggleSelection(initialSelected: string[] = defaultSelected) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const toggle = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);
  return { selected, toggle };
}

type MenuProps = React.ComponentProps<typeof Menu>;

const meta = {
  title: "Components/Menu",
  component: Menu,
  args: {
    position: "bottom-start",
  },
} satisfies Meta<MenuProps>;

export default meta;

type Story = StoryObj<MenuProps>;

const DefaultDemo = (args: MenuProps) => {
  const { selected, toggle } = useToggleSelection();
  const items = useMemo(
    () => groupedItems.map((entry) => withSelection(entry, selected, toggle)),
    [selected, toggle],
  );
  return (
    <Menu
      {...args}
      trigger={<Button variant="solid">Open menu</Button>}
      items={items}
    />
  );
};

const NestedDemo = (args: MenuProps) => {
  const { selected, toggle } = useToggleSelection();
  const items = useMemo(
    () =>
      itemsWithSubActions.map((entry) =>
        withSelection(entry, selected, toggle),
      ),
    [selected, toggle],
  );
  return (
    <Menu
      {...args}
      trigger={<Button variant="solid">Open nested menu</Button>}
      items={items}
    />
  );
};

const PlainButtonTriggerDemo = (args: MenuProps) => {
  const { selected, toggle } = useToggleSelection();
  const items = useMemo(
    () => groupedItems.map((entry) => withSelection(entry, selected, toggle)),
    [selected, toggle],
  );
  return (
    <Menu
      {...args}
      trigger={<button type="button">Open menu</button>}
      items={items}
    />
  );
};

const LongHeaderAndFooterDemo = (args: MenuProps) => {
  const { selected, toggle } = useToggleSelection();
  const items = useMemo(
    () => groupedItems.map((entry) => withSelection(entry, selected, toggle)),
    [selected, toggle],
  );
  return (
    <Menu
      {...args}
      trigger={<Button variant="solid">Open menu</Button>}
      items={items}
      header={
        <span>
          This is a very long header for the menu, spelling out in generous
          detail the context of every action below, wrapping across several
          lines while staying pinned above the scrollable items.
        </span>
      }
      footer={
        <span>
          An equally long footer with fine print: none of the options above take
          effect until confirmed elsewhere, and this note also wraps across
          several lines while staying pinned below the scrollable items.
        </span>
      }
      swapHeaderFooterOnFlip
    />
  );
};

const demoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#666",
};

const LabeledDemo = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 8,
      alignItems: "flex-start",
    }}
  >
    <span style={demoLabelStyle}>{label}</span>
    {children}
  </div>
);

export const Default: Story = {
  render: (args) => (
    <div
      style={{
        display: "flex",
        gap: 32,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <LabeledDemo label="Default">
        <DefaultDemo {...args} />
      </LabeledDemo>
      <LabeledDemo label="Nested sub-actions">
        <NestedDemo {...args} />
      </LabeledDemo>
      <LabeledDemo label="Plain button trigger">
        <PlainButtonTriggerDemo {...args} />
      </LabeledDemo>
      <LabeledDemo label="Long header and footer">
        <LongHeaderAndFooterDemo {...args} />
      </LabeledDemo>
    </div>
  ),
};

const EllipsisMenuDemo = (args: MenuProps) => {
  const ellipsis = useToggleSelection(
    defaultSelected.map((id) => `ellipsis-${id}`),
  );
  const bell = useToggleSelection(defaultSelected.map((id) => `bell-${id}`));
  const disabled = useToggleSelection(
    defaultSelected.map((id) => `disabled-${id}`),
  );
  const ellipsisItems = useMemo(
    () =>
      groupedItems.map((entry) =>
        withSelection(
          prefixIds(entry, "ellipsis"),
          ellipsis.selected,
          ellipsis.toggle,
        ),
      ),
    [ellipsis.selected, ellipsis.toggle],
  );
  const bellItems = useMemo(
    () =>
      groupedItems.map((entry) =>
        withSelection(prefixIds(entry, "bell"), bell.selected, bell.toggle),
      ),
    [bell.selected, bell.toggle],
  );
  const disabledItems = useMemo(
    () =>
      groupedItems.map((entry) =>
        withSelection(
          prefixIds(entry, "disabled"),
          disabled.selected,
          disabled.toggle,
        ),
      ),
    [disabled.selected, disabled.toggle],
  );
  return (
    <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
      <EllipsisMenuComponent {...args} items={ellipsisItems} />
      <EllipsisMenuComponent
        {...args}
        items={bellItems}
        iconName="bell"
        variant="solid"
        size="xs"
      />
      <EllipsisMenuComponent {...args} items={disabledItems} disabled />
    </div>
  );
};

export const EllipsisMenu: Story = {
  render: (args) => <EllipsisMenuDemo {...args} />,
};
