import { useMemo } from "react";

import { type IconName } from "../Icon/icon";

import type { UseMenuContext } from "@ark-ui/react/menu";
import type { ExclusifyUnion } from "type-fest";

type ItemBase = {
  description?: React.ReactNode;
  icon?: IconName;
  loading?: boolean;

  indent?: number;
  disabled?: boolean;
  tone?: "neutral" | "brand" | "error";
  selectedStyle?: "tick" | "checkbox" | "highlight";
};

// When `text` is a plain string we can use it as a stable id, so callers can
// omit `id`. For any non-string `text` (e.g. JSX) an explicit `id` is required.
type ItemTextAndId =
  | { id: string; text: React.ReactNode }
  | { id?: string; text: string };

export type Item = ItemBase &
  ItemTextAndId &
  ExclusifyUnion<
    | {
        href: string;
        target?: "_blank";
      }
    | {
        onClick: (id: string) => void;
      }
    | {
        nestedItems: ItemOrGroup<Item>;
      }
  >;

export const getItemId = (item: Item): string =>
  item.id ?? (typeof item.text === "string" ? item.text : "");

export type ItemOrGroup<ItemType> =
  | ItemType
  | {
      id: string;
      label: React.ReactNode;
      items: ItemType[];
    };

export const isGroup = (
  entry: ItemOrGroup<Item>,
): entry is Extract<ItemOrGroup<Item>, { items: Item[] }> => "items" in entry;

/**
 * Flattens an items-or-groups tree into the ordered list of ids that are
 * actually navigable via keyboard (skipping disabled or loading items, which
 * `ItemRow` renders as non-interactive).
 */
export const collectNavigableItemIds = (
  items: Array<ItemOrGroup<Item>>,
): string[] => {
  const result: string[] = [];
  const isNavigable = (item: Item) => !item.disabled && !item.loading;
  for (const entry of items) {
    if (isGroup(entry)) {
      for (const item of entry.items) {
        if (isNavigable(item)) {
          result.push(getItemId(item));
        }
      }
    } else if (isNavigable(entry)) {
      result.push(getItemId(entry));
    }
  }
  return result;
};

/**
 * Returns a keydown-capture handler that adds "discrete press to wrap,
 * held-key pauses at the boundary" semantics to an ark-ui Menu. Use with
 * `loopFocus={false}`:
 *
 * - A discrete `ArrowDown` while the last item is highlighted (or
 *   `ArrowUp` at the top) wraps to the opposite end via
 *   `menu.setHighlightedValue`.
 * - A held-key auto-repeat at the boundary is blocked, so the menu stops
 *   wrapping while the user is still holding the key down.
 *
 * Wire the returned handler to `onKeyDownCapture` on an element above
 * `Menu.Content` in the React tree (e.g. `Menu.Positioner`), passing the
 * `menu` API from `Menu.Context`.
 */
export const useLoopSelection = (items: Array<ItemOrGroup<Item>>) => {
  const navigableIds = useMemo(() => collectNavigableItemIds(items), [items]);
  const firstId = navigableIds[0];
  const lastId = navigableIds[navigableIds.length - 1];

  return (event: React.KeyboardEvent, menu: UseMenuContext) => {
    const isDown = event.key === "ArrowDown";
    const isUp = event.key === "ArrowUp";
    if (!isDown && !isUp) {
      return;
    }

    // Nested submenus portal to body but remain React descendants, so their
    // key events bubble through capture on this handler. DOM containment lets
    // us ignore those — only events from inside this menu's positioner apply.
    const { currentTarget, target } = event;
    if (
      !(currentTarget instanceof Node) ||
      !(target instanceof Node) ||
      !currentTarget.contains(target)
    ) {
      return;
    }

    const current = menu.highlightedValue;
    const atBottom = lastId !== undefined && current === lastId;
    const atTop = firstId !== undefined && current === firstId;

    if (isDown && atBottom) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && firstId !== undefined) {
        menu.setHighlightedValue(firstId);
      }
    } else if (isUp && atTop) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat && lastId !== undefined) {
        menu.setHighlightedValue(lastId);
      }
    }
  };
};
