import { getTabbables, isTabbable } from "@zag-js/dom-query";
import { useMemo } from "react";

import { type Tone } from "../../../util/form-shared";
import { type IconName } from "../../Icon/icon";

import type { UseMenuContext } from "@ark-ui/react/menu";
import type { ExclusifyUnion } from "type-fest";

type ItemBase = {
  description?: React.ReactNode;
  icon?: IconName;
  loading?: boolean;
  suffix?: React.ReactNode;

  indent?: number;
  disabled?: boolean;
  tone?: Exclude<Tone, "warning" | "success">;
  selectedStyle?: "tick" | "checkbox" | "highlight";
  selectedTone?: Exclude<Tone, "warning" | "success">;
  keepOpenOnSelect?: boolean;
};

// When `text` is a plain string we can use it as a stable id, so callers can
// omit `id`. For any non-string `text` (e.g. JSX) an explicit `id` is required.
type ItemTextAndId =
  | { id: string; text: React.ReactNode }
  | { id?: string; text: string };

type StandardItem = ItemBase &
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
        subItems: Array<ItemOrGroup<Item>>;
      }
  >;

/**
 * A row of arbitrary content. It renders on its own line but is not
 * selectable or highlightable — arrow keys and mouse hover skip it — while
 * focusable children inside it remain reachable with Tab.
 */
export type CustomItem = {
  id?: string;
  custom: React.ReactNode;
} & { [K in Exclude<keyof StandardItem, "id">]?: never };

export type Item = (StandardItem & { custom?: never }) | CustomItem;

export const isCustomItem = (item: Item): item is CustomItem =>
  "custom" in item;

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

/** Prefix of ids assigned internally to custom items declared without one. */
const internalCustomIdPrefix = "__custom-";

export const useItemsWithCustomIds = (
  items: Array<ItemOrGroup<Item>>,
): Array<ItemOrGroup<Item>> =>
  useMemo(() => {
    const orderedCustomItems = items
      .flatMap((entry) => (isGroup(entry) ? entry.items : [entry]))
      .filter(isCustomItem);
    const visitItem = (item: Item): Item =>
      isCustomItem(item) && item.id === undefined
        ? {
            ...item,
            id: `${internalCustomIdPrefix}${orderedCustomItems.indexOf(item)}`,
          }
        : item;
    return items.map((entry) =>
      isGroup(entry)
        ? { ...entry, items: entry.items.map(visitItem) }
        : visitItem(entry),
    );
  }, [items]);

/**
 * The highlighted-item id to report to consumers for a key event from an
 * open menu. Internally assigned custom ids are not exposed; they report as null.
 */
export const getEventHighlightedId = (
  event: React.KeyboardEvent,
  menu: UseMenuContext,
): string | null => {
  const { target } = event;
  const row =
    target instanceof Element
      ? target.closest("[data-selectable-list-custom]")
      : null;
  if (!row) {
    return menu.highlightedValue;
  }
  const id = row.getAttribute("data-selectable-list-custom");
  return id === null || id.startsWith(internalCustomIdPrefix) ? null : id;
};

const getCustomRowElement = (
  content: Element,
  id: string,
): HTMLElement | null => {
  const row = content.querySelector(
    `[data-selectable-list-custom="${CSS.escape(id)}"]`,
  );
  return row instanceof HTMLElement ? row : null;
};

/**
 * zag's tabbable check only tests for a rendered box, so an element hidden
 * with `visibility: hidden` (e.g. a text input's not-currently-shown clear
 * button) counts as tabbable even though the browser skips it; filter those
 * out to match real Tab behaviour.
 */
const getVisibleTabbables = (container: HTMLElement): HTMLElement[] =>
  getTabbables(container).filter(
    (el) => getComputedStyle(el).visibility !== "hidden",
  );

type NavPosition = { kind: "item" | "custom"; id: string };

/** Flattens items into the ordered rows keyboard interaction can land on. */
const collectNavPositions = (
  items: Array<ItemOrGroup<Item>>,
): NavPosition[] => {
  const result: NavPosition[] = [];
  const visit = (item: Item) => {
    if (isCustomItem(item)) {
      result.push({ kind: "custom", id: getItemId(item) });
    } else if (!item.disabled && !item.loading) {
      result.push({ kind: "item", id: getItemId(item) });
    }
  };
  for (const entry of items) {
    if (isGroup(entry)) {
      for (const item of entry.items) {
        visit(item);
      }
    } else {
      visit(entry);
    }
  }
  return result;
};

const wrapIndex = (index: number, length: number) =>
  ((index % length) + length) % length;

/**
 * A Tab stop of a list with custom rows: each maximal run of regular items is a single stop,
 * and each custom row that currently contains a tabbable is a stop of its own.
 */
type TabStop =
  | { kind: "block"; itemIds: string[] }
  | { kind: "custom"; id: string };

/**
 * Returns a keydown-capture handler for a menu's `Content` element that
 * integrates focusable custom rows into keyboard navigation:
 *
 * - ArrowDown/ArrowUp inside a custom row resume list navigation: the
 *   highlight moves to the nearest regular item below/above the row
 *   (wrapping at the ends) and focus returns to the content.
 * - Tab / Shift+Tab move between `TabStop`s: a whole block of regular items
 *   is one stop (entering it focuses the content and highlights its first —
 *   or, backwards, last — item; Tab never steps item-to-item), and each
 *   focusable custom row is another (within a row, Tab first moves between
 *   the row's own tabbables natively). Past the last stop (or before the
 *   first) focus leaves the list: a popover menu closes and hands focus to
 *   the tabbable after its trigger (or the trigger itself, backwards); an
 *   embedded list hands focus to the document's neighbouring tabbable.
 *   Lists without a focusable custom row keep the menu machine's default
 *   Tab handling.
 * - Any other key pressed inside a custom row is stopped from reaching the
 *   menu machine, which would otherwise hijack Enter, Space, Home/End and
 *   typeahead from the focused child. Escape is let through for dismissal.
 */
export const useCustomRowNavigation = (items: Array<ItemOrGroup<Item>>) => {
  const positions = useMemo(() => collectNavPositions(items), [items]);

  return (event: React.KeyboardEvent, menu: UseMenuContext) => {
    const content = event.currentTarget;
    const { target } = event;
    if (
      !(content instanceof HTMLElement) ||
      !(target instanceof HTMLElement) ||
      !content.contains(target)
    ) {
      return;
    }

    const getTabStops = (): TabStop[] => {
      const stops: TabStop[] = [];
      for (const position of positions) {
        if (position.kind === "custom") {
          const rowElement = getCustomRowElement(content, position.id);
          if (rowElement && getVisibleTabbables(rowElement).length > 0) {
            stops.push({ kind: "custom", id: position.id });
          }
        } else {
          const previous = stops[stops.length - 1];
          if (previous?.kind === "block") {
            previous.itemIds.push(position.id);
          } else {
            stops.push({ kind: "block", itemIds: [position.id] });
          }
        }
      }
      return stops;
    };

    // Tab past the list's edge leaves the menu. The content's
    // `aria-labelledby` points at the trigger that opened it (zag wires this
    // for both regular and context triggers), so a popover exits relative to
    // its trigger and closes; an embedded always-open list (whose trigger id
    // resolves to nothing) exits relative to the content itself.
    // The machine has no public clear API, but an empty value falls through
    // to null in its highlight action, un-highlighting every row.
    const clearHighlight = () => {
      menu.setHighlightedValue("");
    };

    const exitList = (direction: 1 | -1) => {
      const doc = content.ownerDocument;
      const labelledBy = content.getAttribute("aria-labelledby");
      const trigger = labelledBy ? doc.getElementById(labelledBy) : null;
      const anchor = trigger ?? content;
      clearHighlight();

      const focusExitTarget = () => {
        if (direction === -1 && isTabbable(trigger)) {
          trigger.focus();
          return;
        }
        const follows = (el: HTMLElement) =>
          Boolean(
            // eslint-disable-next-line no-bitwise -- the DOM API returns a bitmask
            anchor.compareDocumentPosition(el) &
            Node.DOCUMENT_POSITION_FOLLOWING,
          );
        const outside = getVisibleTabbables(doc.body).filter(
          (el) => !content.contains(el) && el !== anchor,
        );
        const eligible =
          direction === 1
            ? outside.filter(follows)
            : outside.filter((el) => !follows(el));
        const exitTarget =
          direction === 1 ? eligible[0] : eligible[eligible.length - 1];
        exitTarget?.focus();
      };

      if (trigger) {
        // A popover: close it. zag's controlled close refocuses the trigger
        // in a microtask, so land the exit focus after that has flushed (rAF
        // callbacks run once pending microtasks are done).
        menu.setOpen(false);
        requestAnimationFrame(focusExitTarget);
      } else {
        focusExitTarget();
      }
    };

    const goToStop = (stops: TabStop[], index: number, direction: 1 | -1) => {
      const stop = stops[index];
      if (!stop) {
        exitList(direction);
        return;
      }
      if (stop.kind === "block") {
        content.focus();
        const id =
          direction === 1
            ? stop.itemIds[0]
            : stop.itemIds[stop.itemIds.length - 1];
        if (id !== undefined) {
          menu.setHighlightedValue(id);
        }
        return;
      }
      const rowElement = getCustomRowElement(content, stop.id);
      const rowTabbables = rowElement ? getVisibleTabbables(rowElement) : [];
      const child =
        direction === 1
          ? rowTabbables[0]
          : rowTabbables[rowTabbables.length - 1];
      clearHighlight();
      child?.focus();
    };

    const row = target.closest("[data-selectable-list-custom]");

    if (row instanceof HTMLElement) {
      const rowId = row.getAttribute("data-selectable-list-custom") ?? "";

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const start = positions.findIndex(
          (position) => position.kind === "custom" && position.id === rowId,
        );
        if (start === -1) {
          return;
        }
        for (let step = 1; step < positions.length; step++) {
          const position =
            positions[wrapIndex(start + direction * step, positions.length)];
          if (position?.kind === "item") {
            content.focus();
            menu.setHighlightedValue(position.id);
            return;
          }
        }
        return;
      }

      if (event.key === "Tab") {
        const direction = event.shiftKey ? -1 : 1;
        const rowTabbables = getVisibleTabbables(row);
        const focusedIndex = rowTabbables.findIndex(
          (el) => el === target || el.contains(target),
        );
        const atRowEdge =
          direction === 1
            ? focusedIndex === -1 || focusedIndex === rowTabbables.length - 1
            : focusedIndex <= 0;
        event.stopPropagation();
        event.preventDefault();
        if (!atRowEdge) {
          // Move within the row ourselves rather than via native Tab, so the
          // movement always agrees with the edge detection above.
          rowTabbables[focusedIndex + direction]?.focus();
          return;
        }
        const stops = getTabStops();
        const start = stops.findIndex(
          (stop) => stop.kind === "custom" && stop.id === rowId,
        );
        if (start === -1) {
          return;
        }
        goToStop(stops, start + direction, direction);
        return;
      }

      if (event.key !== "Escape") {
        event.stopPropagation();
      }
      return;
    }

    // Focus is on the content itself (activedescendant navigation). Only Tab
    // is augmented, and only when a focusable custom row exists.
    if (event.key !== "Tab") {
      return;
    }
    const stops = getTabStops();
    if (!stops.some((stop) => stop.kind === "custom")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const direction = event.shiftKey ? -1 : 1;
    const highlighted = menu.highlightedValue;
    const start =
      highlighted === null
        ? -1
        : stops.findIndex(
            (stop) =>
              stop.kind === "block" && stop.itemIds.includes(highlighted),
          );
    if (start === -1) {
      // Nothing highlighted: the content itself is the current stop —
      // forward enters the first stop, backwards leaves the list.
      if (direction === 1) {
        goToStop(stops, 0, 1);
      } else {
        exitList(-1);
      }
      return;
    }
    goToStop(stops, start + direction, direction);
  };
};

/**
 * Flattens an items-or-groups tree into the ordered list of ids that are
 * actually navigable via keyboard (skipping disabled or loading items, which
 * `ItemRow` renders as non-interactive).
 */
export const collectNavigableItemIds = (
  items: Array<ItemOrGroup<Item>>,
): string[] => {
  const result: string[] = [];
  const isNavigable = (item: Item) =>
    !isCustomItem(item) && !item.disabled && !item.loading;
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

    // Keys originating inside a custom row are handled by
    // useCustomRowNavigation on the content; skip them here so boundary
    // wrapping doesn't fire before that handler runs.
    if (
      target instanceof Element &&
      target.closest("[data-selectable-list-custom]")
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
