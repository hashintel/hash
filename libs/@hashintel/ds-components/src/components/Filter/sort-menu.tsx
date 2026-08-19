import { useEffect, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  Button,
  type ButtonElementProps,
  iconSizeMap as buttonIconSizeMap,
} from "../Button/button";
import { Icon, type IconName } from "../Icon/icon";
import { Menu, type MenuItem } from "../Menu/menu";
import { iconSizeMap } from "../Menu/SelectableList/selectable-list-item.recipe";
import { TextInput } from "../TextInput/text-input";
import {
  directionSuffix,
  directionToggle,
  menuContent,
  placeholderLabel,
  searchEmpty,
  searchRow,
  searchRowRingHidden,
  triggerButton,
  triggerDirectionToggle,
} from "./sort-menu.recipe";
import { readSavedSort, type SortDirection, writeSavedSort } from "./sort-util";

import type { DistributedOmit } from "type-fest";

export type { SortDirection } from "./sort-util";

export type SortDirectionsAvailable =
  | "none"
  | "ascending"
  | "descending"
  | "both";

export type Sorter<SortKey> = {
  name: string;
  sortKey: SortKey;
  /** Defaults to "both"; "none" marks a direction-less sort */
  directionsAvailable?: SortDirectionsAvailable;
};

// The letters read in sort order (ascending: A→Z), matching Font Awesome's
// standard sort pairing rather than mapping the arrow to the direction.
const directionIcons: Record<SortDirection, IconName> = {
  ASCENDING: "sortDownAZ",
  DESCENDING: "sortUpAZ",
};

// The Menu component renders its dropdown at a fixed `sm` size.
const suffixIconSize = iconSizeMap.sm;

const directionsByAvailability: Record<
  SortDirectionsAvailable,
  readonly SortDirection[]
> = {
  none: [],
  ascending: ["ASCENDING"],
  descending: ["DESCENDING"],
  both: ["ASCENDING", "DESCENDING"],
};

const directionsOf = (sorter: Sorter<string>): readonly SortDirection[] =>
  directionsByAvailability[sorter.directionsAvailable ?? "both"];

const flipped = (direction: SortDirection): SortDirection =>
  direction === "ASCENDING" ? "DESCENDING" : "ASCENDING";

/**
 * The search row rendered as the dropdown's first (non-selectable) row. A
 * module-level component so its element type is stable across the menu's
 * re-renders — the input keeps its DOM node, focus and caret while typing
 * re-filters the rows below.
 */
const SearchField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) => {
  const inputRef = useRef<HTMLElement>(null);

  // A text input matches :focus-visible whenever focused, so the focus ring
  // is gated on the interaction modality instead: it shows only when focus
  // arrived via the keyboard (e.g. Tab or list navigation into the field),
  // not from the open autofocus, clicks, or typing into a focused field.
  const modalityRef = useRef<"keyboard" | "pointer">("pointer");
  const [keyboardFocused, setKeyboardFocused] = useState(false);

  // Focus when the (lazily mounted) dropdown opens. Double rAF so the focus
  // lands after ark moves focus to the menu content (mirrors Filter).
  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          inputRef.current?.focus();
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  // Document-level: the keypress that moves focus here (Tab from the menu
  // content, arrow navigation) fires outside this row.
  useEffect(() => {
    const onKeyDown = () => {
      modalityRef.current = "keyboard";
    };
    const onPointerDown = () => {
      modalityRef.current = "pointer";
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  return (
    <div
      className={cx(
        searchRow(),
        keyboardFocused ? undefined : searchRowRingHidden(),
      )}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChange={(next) => onChange(next)}
        onFocus={() => setKeyboardFocused(modalityRef.current === "keyboard")}
        onBlur={() => setKeyboardFocused(false)}
        placeholder="Search…"
        aria-label="Search sort options"
        size="sm"
        prefix={{ iconName: "search", variant: "subtle" }}
        clearable={{ clearable: true, onClear: () => onChange("") }}
      />
    </div>
  );
};

/**
 * A dropdown for choosing how a collection is sorted, triggered by a
 * `Button` (all button props are accepted and forwarded). The dropdown
 * lists the given sorters; selecting one (click or Enter) fires `onChange`
 * with the direction its row shows, and closes the menu. A row's direction
 * appears when the row is active, hovered or keyboard-highlighted; sorters
 * offering both directions show it as a toggle. Clicking the toggle — or
 * pressing left/right on the highlighted row — flips the direction the row
 * displays: on the active sorter that commits immediately (the menu stays
 * open), while on any other row nothing is committed until the row is
 * selected, and closing the menu discards the adjustment.
 *
 * When the active sorter offers both directions, the trigger's own direction
 * icon is also a toggle: clicking it fires `onChange` with the flipped
 * direction immediately, without opening the menu.
 *
 * With `searchable`, a search bar at the top of the dropdown filters the
 * sorters as the user types (every whitespace-separated term must match).
 * The field is focused when the menu opens; down/up move into the results.
 *
 * Controlled via `value`/`onChange`. With `saveSortId` set, the latest
 * selection is persisted to localStorage and — while `value` is undefined on
 * mount — replayed through `onChange` so the parent can adopt it.
 */
export const SortMenu = <SortKey extends string = string>({
  items = [],
  value,
  onChange,
  saveSortId,
  searchable = false,
  variant = "subtle",
  size = "sm",
  className,
  iconName,
  iconPosition,
  prefix,
  suffix,
  ...buttonProps
}: {
  items?: ReadonlyArray<Sorter<SortKey>>;
  value?: { sortKey: NoInfer<SortKey>; direction: SortDirection };
  onChange?: (sortKey: NoInfer<SortKey>, direction: SortDirection) => void;
  saveSortId?: string | null; // id to save selection to localStorage
  /** Adds a search bar to the top of the dropdown that filters the sorters */
  searchable?: boolean;
} & DistributedOmit<
  ButtonElementProps,
  "children" | "pressed" | "onClick" | "type"
>) => {
  // Uncommitted directions set with the row toggles or the arrow keys: they
  // adjust what selecting a row would apply, without selecting it.
  const [draftDirections, setDraftDirections] = useState<
    Partial<Record<SortKey, SortDirection>>
  >({});

  const [search, setSearch] = useState("");
  const searchTerms = search.toLowerCase().split(/\s+/).filter(Boolean);
  // Every whitespace-separated term must appear in the sorter's name.
  const visibleSorters =
    searchable && searchTerms.length > 0
      ? items.filter((sorter) => {
          const name = sorter.name.toLowerCase();
          return searchTerms.every((term) => name.includes(term));
        })
      : items;

  // Drafts are per-open-session state, cleared when the menu closes — a
  // commit does not wipe other rows' pending adjustments (the active row's
  // direction can be committed while the menu stays open).
  const commit = (sortKey: SortKey, direction: SortDirection) => {
    if (saveSortId) {
      writeSavedSort(saveSortId, sortKey, direction);
    }
    onChange?.(sortKey, direction);
  };

  // Replay a persisted selection once on mount, only while the parent has
  // not provided a value of its own. No dependency array: the ref makes it
  // run once while still reading the mount-time props.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) {
      return;
    }
    restoredRef.current = true;
    if (!saveSortId || value !== undefined) {
      return;
    }
    const saved = readSavedSort(saveSortId);
    if (!saved) {
      return;
    }
    const sorter = items.find((entry) => entry.sortKey === saved.sortKey);
    // A direction-less sorter accepts whatever direction was stored.
    const directions = sorter ? directionsOf(sorter) : [];
    if (
      !sorter ||
      (directions.length > 0 && !directions.includes(saved.direction))
    ) {
      return;
    }
    onChange?.(sorter.sortKey, saved.direction);
  });

  // The direction a sorter's row displays: an uncommitted arrow-key draft,
  // else the live direction for the active sorter, else the direction
  // selecting it would apply.
  const shownDirection = (sorter: Sorter<SortKey>): SortDirection =>
    draftDirections[sorter.sortKey] ??
    (value && value.sortKey === sorter.sortKey
      ? value.direction
      : (directionsOf(sorter)[0] ?? "ASCENDING"));

  // Flip the direction a row displays. On the active sorter that is a real
  // change committed immediately (the menu stays open — no selection
  // happens); on any other row it only adjusts the draft that selecting the
  // row would apply.
  const flipDirection = (sorter: Sorter<SortKey>) => {
    const next = flipped(shownDirection(sorter));
    if (value?.sortKey === sorter.sortKey) {
      commit(sorter.sortKey, next);
      return;
    }
    setDraftDirections((previous) => ({
      ...previous,
      [sorter.sortKey]: next,
    }));
  };

  const selectSorter = (sorter: Sorter<SortKey>) => {
    const direction = shownDirection(sorter);
    if (
      value &&
      value.sortKey === sorter.sortKey &&
      value.direction === direction
    ) {
      // Re-selecting the current sort unchanged: close without firing.
      return;
    }
    commit(sorter.sortKey, direction);
  };

  // Left/right arrows flip the highlighted row's displayed direction
  // (committing immediately on the active row, as a draft elsewhere). Keys
  // typed into the search row report its row id, which matches no sorter, so
  // caret movement in the input is never intercepted.
  const handleContentKeyDown = (
    event: React.KeyboardEvent,
    highlightedValue: string | null,
  ) => {
    if (
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
      highlightedValue === null
    ) {
      return;
    }
    const sorter = items.find((entry) => entry.sortKey === highlightedValue);
    if (!sorter || directionsOf(sorter).length < 2) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    flipDirection(sorter);
  };

  const sorterItems = visibleSorters.map((sorter): MenuItem => {
    const isActive = value?.sortKey === sorter.sortKey;
    const directions = directionsOf(sorter);
    const flippable = directions.length > 1;
    const direction = shownDirection(sorter);
    // The toggle's label names the direction its click would display.
    const outcome = flipped(direction);

    return {
      id: sorter.sortKey,
      text: sorter.name,
      selectedStyle: "highlight",
      selected: isActive,
      onClick: () => selectSorter(sorter),
      suffix: flippable ? (
        <span
          className={directionSuffix()}
          onPointerDown={(event) => {
            // Keep focus on the menu content and hide the press from the
            // menu item so selecting (and closing) never triggers.
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            // The menu keeps focus on its content and highlights rows via
            // aria-activedescendant, so the toggle stays out of the tab
            // order; left/right arrows on the row are the keyboard
            // equivalent.
            tabIndex={-1}
            className={directionToggle()}
            aria-label={`Sort by ${sorter.name}, ${outcome.toLowerCase()}`}
            onClick={(event) => {
              event.stopPropagation();
              flipDirection(sorter);
            }}
          >
            <Icon name={directionIcons[direction]} size={suffixIconSize} />
          </button>
        </span>
      ) : directions.length === 1 ? (
        <span className={directionSuffix()} aria-hidden="true">
          <Icon name={directionIcons[direction]} size={suffixIconSize} />
        </span>
      ) : undefined,
    };
  });

  const menuItems: MenuItem[] = searchable
    ? [
        {
          id: "sort-menu-search",
          custom: <SearchField value={search} onChange={setSearch} />,
        },
        ...sorterItems,
        ...(visibleSorters.length === 0
          ? [
              {
                id: "sort-menu-search-empty",
                custom: (
                  <span className={searchEmpty()}>No matching sorts</span>
                ),
              },
            ]
          : []),
      ]
    : sorterItems;

  const selectedSorter = value
    ? items.find((sorter) => sorter.sortKey === value.sortKey)
    : undefined;
  // A direction-less active sorter shows the generic sort glyph and drops
  // the direction from the label.
  const selectedHasDirection =
    selectedSorter !== undefined && directionsOf(selectedSorter).length > 0;

  // When the active sorter offers both directions, the trigger's icon is
  // itself a flip control: clicking it commits the opposite direction
  // without opening (or closing) the menu — the pointer interception keeps
  // the press from reaching the menu trigger. A nested real <button> would
  // be invalid inside the trigger button, so it is a role="button" span,
  // kept out of the tab order (the dropdown is the keyboard path).
  const flippableTriggerIcon =
    value && selectedSorter && directionsOf(selectedSorter).length > 1 ? (
      <span
        role="button"
        tabIndex={-1}
        className={triggerDirectionToggle()}
        aria-label={`Sort by ${selectedSorter.name}, ${flipped(value.direction).toLowerCase()}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          commit(selectedSorter.sortKey, flipped(value.direction));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
            commit(selectedSorter.sortKey, flipped(value.direction));
          }
        }}
      >
        <Icon
          name={directionIcons[value.direction]}
          size={buttonIconSizeMap[size]}
        />
      </span>
    ) : undefined;

  // Default to a direction-aware sort glyph, but let a caller's own icon
  // props (either Button icon flavour) take over wholesale.
  const triggerIconProps =
    iconName !== undefined || prefix !== undefined || suffix !== undefined
      ? iconName !== undefined
        ? { iconName, iconPosition }
        : { prefix, suffix }
      : flippableTriggerIcon !== undefined
        ? { prefix: flippableTriggerIcon }
        : {
            iconName:
              value && selectedHasDirection
                ? directionIcons[value.direction]
                : ("sortDown" as const),
          };

  return (
    <Menu
      trigger={
        <Button
          aria-label={
            selectedSorter && value
              ? selectedHasDirection
                ? `Sort by ${selectedSorter.name}, ${value.direction.toLowerCase()}`
                : `Sort by ${selectedSorter.name}`
              : "Sort"
          }
          {...buttonProps}
          className={cx(triggerButton(), className)}
          variant={variant}
          size={size}
          {...triggerIconProps}
        >
          {selectedSorter ? (
            selectedSorter.name
          ) : (
            <span className={placeholderLabel()}>Sort</span>
          )}
        </Button>
      }
      items={menuItems}
      className={menuContent()}
      onOpen={(open) => {
        if (!open) {
          setDraftDirections({});
          setSearch("");
        }
      }}
      onKeyDown={handleContentKeyDown}
    />
  );
};
