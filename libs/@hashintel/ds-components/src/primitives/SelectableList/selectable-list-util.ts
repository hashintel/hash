import { getTabbables, isTabbable } from "@zag-js/dom-query";
import { useCallback, useMemo, useState } from "react";

import { type IconName } from "../../components/Icon/icon";
import { type Tone } from "../../util/form-shared";
import { hasCaretModifier, hasCommandModifier } from "../../util/keyboard";

import type { UseMenuContext } from "@ark-ui/react/menu";
import type { ExclusifyUnion } from "type-fest";

type ItemBase = {
  /** One line of secondary text under the label */
  description?: React.ReactNode;
  /** Design-system icon before the label — use sparingly, to differentiate important items */
  icon?: IconName;
  /** Shows a spinner and makes the item inert */
  loading?: boolean;
  /** Trailing content aligned to the row's end, e.g. a count */
  suffix?: React.ReactNode;

  /** Indents the row by this many steps */
  indent?: number;
  /** Disables the item; arrow keys skip it */
  disabled?: boolean;
  /** `error` marks destructive actions */
  tone?: Exclude<Tone, "warning" | "success">;
  /** How a selected item is shown */
  selectedStyle?: "tick" | "checkbox" | "highlight" | "radio";
  /** Tone of the selected indicator, when it differs from `tone` */
  selectedTone?: Exclude<Tone, "warning" | "success">;
  /** Keeps the menu open when this item is selected */
  keepOpenOnSelect?: boolean;
};

// When `text` is a plain string we can use it as a stable id, so callers can
// omit `id`. For any non-string `text` (e.g. JSX) an explicit `id` is required.
type ItemTextAndId =
  | {
      /** Identifies the item, e.g. in `onClick`. Required when `text` is not a plain string; a plain-string `text` doubles as the id. */
      id: string;
      /** The row's label. A plain string doubles as the item's `id`. */
      text: React.ReactNode;
    }
  | {
      /** Identifies the item, e.g. in `onClick`. Required when `text` is not a plain string; a plain-string `text` doubles as the id. */
      id?: string;
      /** The row's label. A plain string doubles as the item's `id`. */
      text: string;
    };

type StandardItem = ItemBase &
  ItemTextAndId &
  ExclusifyUnion<
    | {
        /** Renders the item as a link to this URL — one of `href`, `onClick`, or `subItems` per item */
        href: string;
        /** Opens the link in a new tab */
        target?: "_blank";
      }
    | {
        /** Called with the item's `id` when it is activated */
        onClick: (id: string) => void;
      }
    | {
        /** Opens a nested submenu of these entries */
        subItems: Array<ItemOrGroup<Item>>;
        /**
         * Applied to this item's submenu content, composed with the list's
         * own class, for styling that only that submenu should carry.
         */
        menuClassName?: string;
      }
    | {
        /** Whether the item is an expandable row that reveals `subItems` inline, indented beneath it like a folder tree. Its chevron button (and ArrowRight/ArrowLeft while highlighted) toggles it; activating the row fires `onClick`, or toggles when there is no `onClick`. */
        collapsible: true;
        /** The entries revealed inline beneath this item while it is expanded */
        subItems: Array<ItemOrGroup<Item>>;
        /** Whether the item starts out expanded */
        defaultExpanded?: boolean;
        /** Called with the item's `id` when it is activated */
        onClick?: (id: string) => void;
      }
  >;

/**
 * A row of arbitrary content. It renders on its own line but is not
 * selectable or highlightable — arrow keys and mouse hover skip it — while
 * focusable children inside it remain reachable with Tab.
 */
export type CustomItem = {
  id?: string;
  /** A row of arbitrary content — never highlighted or selectable, though Tab reaches focusable children. Mutually exclusive with every other field. */
  custom: React.ReactNode;
} & { [K in Exclude<keyof StandardItem, "id">]?: never };

export type Item = (StandardItem & { custom?: never }) | CustomItem;

export const isCustomItem = (item: Item): item is CustomItem =>
  "custom" in item;

export type CollapsibleItem = Item & {
  collapsible: true;
  subItems: Array<ItemOrGroup<Item>>;
};

export const isCollapsibleItem = (item: Item): item is CollapsibleItem =>
  !isCustomItem(item) && item.collapsible === true;

export const getItemId = (item: Item): string =>
  item.id ?? (typeof item.text === "string" ? item.text : "");

export interface CollapsibleFolder<TChild> {
  /** Nested options that sit beneath this item in a collapsible sub-folder. The item itself remains selectable, and a chevron button is added to toggle revealing sub-items */
  subItems: ReadonlyArray<TChild>;
}

export type NotCollapsible = {
  subItems?: never;
};

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

/** Expansion state of a list's `collapsible` items. */
export type CollapsibleExpansion = {
  /** The ids of the collapsible items whose subItems are currently revealed. */
  expandedIds: ReadonlySet<string>;
  /** Flips the given collapsible item between expanded and collapsed. */
  onToggle: (id: string) => void;
  /**
   * Marks the given collapsible items expanded — dropdowns reveal the
   * selection's collapsed ancestors on open with it. Optional: derived
   * wrappers (e.g. the searching override) omit it.
   */
  expand?: (ids: ReadonlySet<string>) => void;
};

/**
 * The ids of the collapsible items with a selected item somewhere beneath
 * them — the set to expand so every selection is visible.
 */
export const collectSelectedAncestorIds = (
  items: Array<ItemOrGroup<Item>>,
  selected: ReadonlySet<string>,
): ReadonlySet<string> => {
  const result = new Set<string>();
  if (selected.size === 0) {
    return result;
  }
  // Returns whether the entry or any descendant is selected, collecting the
  // collapsible items along the way.
  const visitEntry = (entry: ItemOrGroup<Item>): boolean => {
    if (isGroup(entry)) {
      let containsSelected = false;
      for (const item of entry.items) {
        containsSelected = visitEntry(item) || containsSelected;
      }
      return containsSelected;
    }
    if (isCustomItem(entry)) {
      return false;
    }
    let descendantSelected = false;
    for (const child of entry.subItems ?? []) {
      descendantSelected = visitEntry(child) || descendantSelected;
    }
    if (descendantSelected && isCollapsibleItem(entry)) {
      result.add(getItemId(entry));
    }
    return descendantSelected || selected.has(getItemId(entry));
  };
  for (const entry of items) {
    visitEntry(entry);
  }
  return result;
};

/** Collects every collapsible item id in the tree, expanded or not. */
export const collectCollapsibleIds = (
  items: Array<ItemOrGroup<Item>>,
): ReadonlySet<string> => {
  const result = new Set<string>();
  const visitEntry = (entry: ItemOrGroup<Item>) => {
    if (isGroup(entry)) {
      for (const item of entry.items) {
        visitEntry(item);
      }
      return;
    }
    if (isCollapsibleItem(entry)) {
      result.add(getItemId(entry));
      for (const child of entry.subItems) {
        visitEntry(child);
      }
    }
  };
  for (const entry of items) {
    visitEntry(entry);
  }
  return result;
};

/**
 * Expansion state for a tree of items with `collapsible` entries. Expansion
 * is uncontrolled: each item starts at its `defaultExpanded` and user toggles
 * are tracked on top, so items that appear later (e.g. async loads) still
 * honour their default. Pass `revealSelected` to also start the collapsed
 * ancestors of the selected items expanded, so the selection is visible right
 * away — decided per folder when it first appears, covering options that
 * arrive while the list is already showing; dropdown consumers additionally
 * re-reveal on every open via the returned `expand`.
 *
 * `SelectableList` manages this internally; consumers that need the set of
 * visible rows themselves (e.g. to build an ark collection) call it and pass
 * the result on via the list's `expansion` prop.
 */
export const useCollapsibleExpansion = (
  items: Array<ItemOrGroup<Item>>,
  revealSelected?: ReadonlySet<string>,
): CollapsibleExpansion => {
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const collapsibleIds = useMemo(() => collectCollapsibleIds(items), [items]);
  // Reveal is decided per folder when it first appears — at mount, or later
  // for options that arrive while the list is already showing (async loads):
  // a newcomer starts expanded when the selection hides beneath it. Folders
  // already seen are left alone: later selection changes must not expand
  // (or worse, re-collapse) them behind the user's back.
  const [reveal, setReveal] = useState<{
    seenIds: ReadonlySet<string>;
    revealedIds: ReadonlySet<string>;
  }>(() => ({
    seenIds: collapsibleIds,
    revealedIds:
      revealSelected === undefined
        ? new Set()
        : collectSelectedAncestorIds(items, revealSelected),
  }));
  if ([...collapsibleIds].some((id) => !reveal.seenIds.has(id))) {
    const revealedIds = new Set(reveal.revealedIds);
    if (revealSelected !== undefined) {
      for (const id of collectSelectedAncestorIds(items, revealSelected)) {
        if (!reveal.seenIds.has(id)) {
          revealedIds.add(id);
        }
      }
    }
    setReveal({
      seenIds: new Set([...reveal.seenIds, ...collapsibleIds]),
      revealedIds,
    });
  }
  const defaults = useMemo(() => {
    const result = new Map<string, boolean>();
    const visitEntry = (entry: ItemOrGroup<Item>) => {
      if (isGroup(entry)) {
        for (const item of entry.items) {
          visitEntry(item);
        }
        return;
      }
      if (isCollapsibleItem(entry)) {
        const id = getItemId(entry);
        result.set(
          id,
          (entry.defaultExpanded ?? false) || reveal.revealedIds.has(id),
        );
        for (const child of entry.subItems) {
          visitEntry(child);
        }
      }
    };
    for (const entry of items) {
      visitEntry(entry);
    }
    return result;
  }, [items, reveal.revealedIds]);
  const expandedIds = useMemo(() => {
    const result = new Set<string>();
    for (const [id, defaultExpanded] of defaults) {
      if (toggled.get(id) ?? defaultExpanded) {
        result.add(id);
      }
    }
    return result;
  }, [defaults, toggled]);
  const onToggle = useCallback(
    (id: string) => {
      setToggled((previous) => {
        const next = new Map(previous);
        next.set(id, !(previous.get(id) ?? defaults.get(id) ?? false));
        return next;
      });
    },
    [defaults],
  );
  const expand = useCallback(
    (ids: ReadonlySet<string>) => {
      if (ids.size === 0) {
        return;
      }
      setToggled((previous) => {
        const collapsed = [...ids].filter(
          (id) => !(previous.get(id) ?? defaults.get(id) ?? false),
        );
        if (collapsed.length === 0) {
          return previous;
        }
        const next = new Map(previous);
        for (const id of collapsed) {
          next.set(id, true);
        }
        return next;
      });
    },
    [defaults],
  );
  return useMemo(
    () => ({ expandedIds, onToggle, expand }),
    [expandedIds, onToggle, expand],
  );
};

/**
 * Whether any item nested under a collapsible item — at any depth, through
 * groups, nested collapsibles and submenus — is selected. Backs the badge a
 * collapsed row shows so hidden selections stay discoverable.
 */
export const hasSelectedDescendant = (
  item: CollapsibleItem,
  selected: ReadonlySet<string>,
): boolean => {
  const visitEntry = (entry: ItemOrGroup<Item>): boolean => {
    if (isGroup(entry)) {
      return entry.items.some(visitEntry);
    }
    if (isCustomItem(entry)) {
      return false;
    }
    if (selected.has(getItemId(entry))) {
      return true;
    }
    return entry.subItems?.some(visitEntry) ?? false;
  };
  return item.subItems.some(visitEntry);
};

/**
 * Returns a keydown-capture handler for a menu's `Content` that lets
 * ArrowRight expand and ArrowLeft collapse the highlighted collapsible row.
 * Row activation (Enter, click) is selection, so the keyboard's toggle lives
 * on the horizontal arrows, mirroring tree views.
 */
export const useCollapsibleToggleKeyDown = (
  items: Array<ItemOrGroup<Item>>,
  expansion: CollapsibleExpansion,
) => {
  const collapsibleIds = useMemo(() => collectCollapsibleIds(items), [items]);

  return (event: React.KeyboardEvent, menu: UseMenuContext) => {
    if (
      (event.key !== "ArrowRight" && event.key !== "ArrowLeft") ||
      hasCaretModifier(event)
    ) {
      return;
    }
    // Nested submenus portal outside this content; custom rows (e.g. a
    // search field) own their horizontal arrows for the caret.
    const { currentTarget, target } = event;
    if (
      !(currentTarget instanceof Node) ||
      !(target instanceof Node) ||
      !currentTarget.contains(target)
    ) {
      return;
    }
    if (
      target instanceof Element &&
      target.closest("[data-selectable-list-custom]")
    ) {
      return;
    }
    const highlighted = menu.highlightedValue;
    if (highlighted === null || !collapsibleIds.has(highlighted)) {
      return;
    }
    const isExpanded = expansion.expandedIds.has(highlighted);
    if (event.key === "ArrowRight" ? isExpanded : !isExpanded) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    expansion.onToggle(highlighted);
  };
};

/**
 * Flattens an items-or-groups tree into the ordered list of selectable rows
 * the list currently renders: group members are inlined, custom rows are
 * dropped, and a collapsible item contributes itself plus — while expanded —
 * its subItems. The backing list for an ark collection.
 */
export const flattenVisibleItems = (
  items: Array<ItemOrGroup<Item>>,
  expandedIds: ReadonlySet<string>,
): Item[] => {
  const result: Item[] = [];
  const visitEntry = (entry: ItemOrGroup<Item>) => {
    if (isGroup(entry)) {
      for (const item of entry.items) {
        visitEntry(item);
      }
      return;
    }
    if (isCustomItem(entry)) {
      return;
    }
    result.push(entry);
    if (isCollapsibleItem(entry) && expandedIds.has(getItemId(entry))) {
      for (const child of entry.subItems) {
        visitEntry(child);
      }
    }
  };
  for (const entry of items) {
    visitEntry(entry);
  }
  return result;
};

/** Prefix of ids assigned internally to custom items declared without one. */
const internalCustomIdPrefix = "__custom-";

/** Internal row ids for a header/footer taking part in keyboard navigation. */
export const headerRowId = `${internalCustomIdPrefix}header`;
export const footerRowId = `${internalCustomIdPrefix}footer`;

export const useItemsWithCustomIds = (
  items: Array<ItemOrGroup<Item>>,
): Array<ItemOrGroup<Item>> =>
  useMemo(() => {
    // Collapsible subtrees render in this same list, so their custom rows
    // take part in the id assignment; submenu subItems are normalized by
    // their own `NestedMenu` instead.
    const orderedCustomItems: CustomItem[] = [];
    const collect = (entry: ItemOrGroup<Item>) => {
      if (isGroup(entry)) {
        for (const item of entry.items) {
          collect(item);
        }
        return;
      }
      if (isCustomItem(entry)) {
        orderedCustomItems.push(entry);
        return;
      }
      if (isCollapsibleItem(entry)) {
        for (const child of entry.subItems) {
          collect(child);
        }
      }
    };
    for (const entry of items) {
      collect(entry);
    }
    const visitItem = (item: Item): Item => {
      if (isCustomItem(item)) {
        return item.id === undefined
          ? {
              ...item,
              id: `${internalCustomIdPrefix}${orderedCustomItems.indexOf(item)}`,
            }
          : item;
      }
      if (isCollapsibleItem(item)) {
        return {
          ...item,
          subItems: item.subItems.map((entry) =>
            isGroup(entry)
              ? { ...entry, items: entry.items.map(visitItem) }
              : visitItem(entry),
          ),
        };
      }
      return item;
    };
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
export const getVisibleTabbables = (container: HTMLElement): HTMLElement[] =>
  getTabbables(container).filter(
    (el) => getComputedStyle(el).visibility !== "hidden",
  );

type NavPosition = { kind: "item" | "custom"; id: string };

/** Flattens items into the ordered rows keyboard interaction can land on. */
const collectNavPositions = (
  items: Array<ItemOrGroup<Item>>,
  expandedIds: ReadonlySet<string>,
): NavPosition[] => {
  const result: NavPosition[] = [];
  const visit = (item: Item) => {
    if (isCustomItem(item)) {
      result.push({ kind: "custom", id: getItemId(item) });
      return;
    }
    if (!item.disabled && !item.loading) {
      result.push({ kind: "item", id: getItemId(item) });
    }
    if (isCollapsibleItem(item) && expandedIds.has(getItemId(item))) {
      for (const entry of item.subItems) {
        if (isGroup(entry)) {
          for (const child of entry.items) {
            visit(child);
          }
        } else {
          visit(entry);
        }
      }
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
 *
 * A header/footer rendered by the list (marked with `headerRowId` /
 * `footerRowId`) participates as a custom row at the corresponding edge.
 */
const noExpandedIds: ReadonlySet<string> = new Set();

export const useCustomRowNavigation = (
  items: Array<ItemOrGroup<Item>>,
  options?: {
    hasHeader?: boolean;
    hasFooter?: boolean;
    /** The currently revealed collapsible items, whose subItems are rows too */
    expandedIds?: ReadonlySet<string>;
  },
) => {
  const hasHeader = options?.hasHeader ?? false;
  const hasFooter = options?.hasFooter ?? false;
  const expandedIds = options?.expandedIds ?? noExpandedIds;
  const positions = useMemo(() => {
    const rows = collectNavPositions(items, expandedIds);
    if (hasHeader) {
      rows.unshift({ kind: "custom", id: headerRowId });
    }
    if (hasFooter) {
      rows.push({ kind: "custom", id: footerRowId });
    }
    return rows;
  }, [items, hasHeader, hasFooter, expandedIds]);

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

      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        !hasCaretModifier(event)
      ) {
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

      if (event.key === "Tab" && !hasCommandModifier(event)) {
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
    if (event.key !== "Tab" || hasCommandModifier(event)) {
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
 * Keydown-capture handler that adds "discrete press to wrap, held-key pauses
 * at the boundary" semantics to an ark-ui Menu. Use with `loopFocus={false}`:
 *
 * - A discrete `ArrowDown` while the last item is highlighted (or
 *   `ArrowUp` at the top) wraps to the opposite end via
 *   `menu.setHighlightedValue`.
 * - A held-key auto-repeat at the boundary is blocked, so the menu stops
 *   wrapping while the user is still holding the key down.
 *
 * The boundary items are read from the DOM at event time — the same
 * `[role^="menuitem"]` walk the menu machine's own arrow navigation uses —
 * so rows revealed or hidden dynamically (expanded collapsible children,
 * filtered lists) are always accounted for.
 *
 * Wire it to `onKeyDownCapture` on an element above `Menu.Content` in the
 * React tree (e.g. `Menu.Positioner`), passing the `menu` API from
 * `Menu.Context`.
 */
export const loopSelectionKeyDown = (
  event: React.KeyboardEvent,
  menu: UseMenuContext,
) => {
  const isDown = event.key === "ArrowDown";
  const isUp = event.key === "ArrowUp";
  // Cmd+Down means "jump to end", not "wrap to top".
  if ((!isDown && !isUp) || hasCommandModifier(event)) {
    return;
  }

  // Nested submenus portal to body but remain React descendants, so their
  // key events bubble through capture on this handler. DOM containment lets
  // us ignore those — only events from inside this menu's positioner apply.
  const { currentTarget, target } = event;
  if (
    !(currentTarget instanceof Element) ||
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

  // A nested submenu's own positioner portals outside this one, so this
  // query only sees the rows of this menu's content.
  const rows = currentTarget.querySelectorAll(
    '[role^="menuitem"]:not([data-disabled])',
  );
  const firstId = rows[0]?.getAttribute("data-value") ?? undefined;
  const lastId = rows[rows.length - 1]?.getAttribute("data-value") ?? undefined;

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
