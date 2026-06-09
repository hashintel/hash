import { useCallback, useMemo, useState } from "react";

import { Button } from "../Button/button";
import { getItemId } from "../SelectableList/selectable-list-util";
import {
  groupedItems,
  itemsWithSubActions,
} from "../SelectableList/selectable-list.fixtures";
import { EllipsisMenu as EllipsisMenuComponent } from "./ellipsis-menu";
import { Menu, type MenuItem } from "./menu";

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

/**
 * Recursively rewires items so that selecting any leaf (non-`href`,
 * non-`nestedItems` parent) toggles its id via the provided callback
 * and reflects the current selection state via the `selected` flag.
 * Sets `keepOpenOnSelect` so the demo shows the selection update
 * without the menu closing.
 */
function withSelection(
  entry: ItemOrGroup<Item>,
  selected: string[],
  toggle: (id: string) => void,
): ItemOrGroup<MenuItem> {
  if ("items" in entry) {
    return {
      ...entry,
      items: entry.items.map(
        (item) => withSelection(item, selected, toggle) as MenuItem,
      ),
    };
  }
  const nested = (entry as { nestedItems?: ItemOrGroup<Item> }).nestedItems;
  if (nested) {
    return {
      ...entry,
      nestedItems: withSelection(nested, selected, toggle),
    } as unknown as MenuItem;
  }
  if ("href" in entry && entry.href) {
    return entry as MenuItem;
  }
  return {
    ...entry,
    onClick: toggle,
    keepOpenOnSelect: true,
    selected: selected.includes(getItemId(entry)),
  } as MenuItem;
}

function useToggleSelection() {
  const [selected, setSelected] = useState<string[]>([]);
  const toggle = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);
  return { selected, toggle };
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

export const Default: Story<MenuProps> = (args) => {
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

export const Nested: Story<MenuProps> = (args) => {
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

export const PlainButtonTrigger: Story<MenuProps> = (args) => {
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

export const EllipsisMenu: Story<MenuProps> = (args) => {
  const ellipsis = useToggleSelection();
  const bell = useToggleSelection();
  const disabled = useToggleSelection();
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
