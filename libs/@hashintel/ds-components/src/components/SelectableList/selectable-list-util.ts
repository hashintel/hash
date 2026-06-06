import { useMemo, useRef } from "react";

import { type IconName } from "../Icon/icon";

import type { UseMenuContext } from "@ark-ui/react/menu";
import type { ExclusifyUnion } from "type-fest";

export type Item = {
  id: string;

  text: React.ReactNode;
  description?: React.ReactNode;
  icon?: IconName;
  loading?: boolean;

  indent?: number;
  disabled?: boolean;
  tone?: "neutral" | "brand" | "error";
  selectedStyle?: "none" | "tick" | "checkbox" | "radio" | "highlight";
} & ExclusifyUnion<
  | {
      href: string;
      target?: "_blank";
    }
  | {
      onClick: (id: string) => void;
    }
  | {
      nestedItems?: ItemOrGroup<Item>;
    }
>;

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
 * actually navigable via keyboard (skipping disabled items).
 */
export const collectNavigableItemIds = (
  items: Array<ItemOrGroup<Item>>,
): string[] => {
  const result: string[] = [];
  for (const entry of items) {
    if (isGroup(entry)) {
      for (const item of entry.items) {
        if (!item.disabled) {
          result.push(item.id);
        }
      }
    } else if (!entry.disabled) {
      result.push(entry.id);
    }
  }
  return result;
};

/**
 * Adds a "press once to pause, press again to wrap" behaviour to keyboard
 * navigation of an ark-ui Menu. Use with `loopFocus={false}`:
 *
 * - The first time the user presses ArrowDown while the last item is
 *   highlighted (or ArrowUp at the top), nothing happens (ark-ui's default
 *   no-loop behaviour). The boundary is remembered.
 * - A held-key auto-repeat at the boundary also does nothing — the user
 *   has to release the key first.
 * - The next discrete press of the same arrow key wraps to the opposite
 *   end via `menu.setHighlightedValue`.
 *
 * Returns handlers to wire into `Menu.Root`'s `onOpenChange` and the
 * `onKeyDownCapture` of an element above `Menu.Content` in the React tree
 * (e.g. `Menu.Positioner`).
 */
export const useLoopSelection = (items: Array<ItemOrGroup<Item>>) => {
  const navigableIds = useMemo(() => collectNavigableItemIds(items), [items]);
  const firstId = navigableIds[0];
  const lastId = navigableIds[navigableIds.length - 1];

  // Tracks which boundary the previous interaction left us paused at, so
  // the next discrete press at that boundary can opt into the wrap.
  const pausedAtRef = useRef<"top" | "bottom" | null>(null);

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open) {
      pausedAtRef.current = null;
    }
  };

  const handleKeyDownCapture = (
    event: React.KeyboardEvent,
    menu: UseMenuContext,
  ) => {
    const isDown = event.key === "ArrowDown";
    const isUp = event.key === "ArrowUp";
    if (!isDown && !isUp) {
      pausedAtRef.current = null;
      return;
    }

    const current = menu.highlightedValue;
    const atBottom = lastId !== undefined && current === lastId;
    const atTop = firstId !== undefined && current === firstId;

    if (
      isDown &&
      atBottom &&
      pausedAtRef.current === "bottom" &&
      !event.repeat &&
      firstId !== undefined
    ) {
      // Second discrete press at the bottom — wrap manually.
      event.preventDefault();
      event.stopPropagation();
      menu.setHighlightedValue(firstId);
      pausedAtRef.current = null;
    } else if (
      isUp &&
      atTop &&
      pausedAtRef.current === "top" &&
      !event.repeat &&
      lastId !== undefined
    ) {
      event.preventDefault();
      event.stopPropagation();
      menu.setHighlightedValue(lastId);
      pausedAtRef.current = null;
    } else if (isDown && atBottom) {
      // First press or held key at bottom — `loopFocus` is off so ark-ui
      // already stays put; just remember that we're paused so the next
      // discrete press wraps.
      pausedAtRef.current = "bottom";
    } else if (isUp && atTop) {
      pausedAtRef.current = "top";
    } else {
      pausedAtRef.current = null;
    }
  };

  return { handleOpenChange, handleKeyDownCapture };
};
