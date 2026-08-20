import { useEffect, useRef, useState } from "react";

import { cx } from "@hashintel/ds-helpers/css";

import {
  Button,
  type ButtonElementProps,
  iconSizeMap as buttonIconSizeMap,
} from "../Button/button";
import { Icon } from "../Icon/icon";
import { Menu, type MenuItem } from "../Menu/menu";
import {
  readSavedSort,
  type SortDirection,
  writeSavedSort,
  directionsOf,
  directionIcons,
  flipped,
  type Sorter,
} from "./sort-menu-util";
import {
  directionSuffix,
  directionToggle,
  menuContent,
  placeholderLabel,
  searchEmpty,
  searchIcon,
  searchInput,
  searchRow,
  triggerButton,
  triggerDirectionToggle,
} from "./sort-menu.recipe";

import type { DistributedOmit } from "type-fest";

const SearchField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className={searchRow()}>
      <Icon name="search" size="sm" className={searchIcon()} />
      <input
        ref={inputRef}
        type="text"
        className={searchInput()}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="Search…"
        aria-label="Search sort options"
      />
    </div>
  );
};

export const SortMenu = <SortKey extends string = string>({
  items = [],
  value,
  onChange,
  saveSortId,
  searchable = false,
  renderTrigger = "default",
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
  /**
   * "default" labels the trigger with the active sorter's name; "icon"
   * collapses it to an icon-only button. A function renders a fully custom trigger
   */
  renderTrigger?:
    | "default"
    | "icon"
    | ((
        sorter: Sorter<NoInfer<SortKey>> | undefined,
        direction: SortDirection | undefined,
      ) => React.ReactElement);
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
  const visibleSorters =
    searchable && searchTerms.length > 0
      ? items.filter((sorter) => {
          const name = sorter.name.toLowerCase();
          return searchTerms.every((term) => name.includes(term));
        })
      : items;

  const commit = (sortKey: SortKey, direction: SortDirection) => {
    if (saveSortId) {
      writeSavedSort(saveSortId, sortKey, direction);
    }
    onChange?.(sortKey, direction);
  };

  // Restore a previously saved sort choice. items/saveSortId may arrive
  // async, so keep retrying until the restore can be resolved one way or
  // the other; only then latch the ref.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) {
      return;
    }
    if (value !== undefined) {
      // The consumer already has a sort; never override it.
      restoredRef.current = true;
      return;
    }
    if (!saveSortId || items.length === 0) {
      return;
    }
    restoredRef.current = true;
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

  const shownDirection = (sorter: Sorter<SortKey>): SortDirection =>
    draftDirections[sorter.sortKey] ??
    (value && value.sortKey === sorter.sortKey
      ? value.direction
      : (directionsOf(sorter)[0] ?? "ASCENDING"));

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
  // Keys typed into the search row report its row id, which matches no sorter, so
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
      selectedTone: "brand",
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
            <Icon name={directionIcons[direction]} size="sm" />
          </button>
        </span>
      ) : directions.length === 1 ? (
        <span className={directionSuffix()} aria-hidden="true">
          <Icon name={directionIcons[direction]} size="sm" />
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

  const selectedHasDirection =
    selectedSorter !== undefined && directionsOf(selectedSorter).length > 0;

  const flippableTriggerIcon =
    renderTrigger === "default" &&
    value &&
    selectedSorter &&
    directionsOf(selectedSorter).length > 1 ? (
      <span
        role="button"
        tabIndex={-1}
        className={triggerDirectionToggle({ size })}
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

  const trigger =
    typeof renderTrigger === "function" ? (
      renderTrigger(
        selectedSorter,
        value && selectedHasDirection ? value.direction : undefined,
      )
    ) : (
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
        {renderTrigger === "default" &&
          (selectedSorter ? (
            selectedSorter.name
          ) : (
            <span className={placeholderLabel()}>Sort</span>
          ))}
      </Button>
    );

  return (
    <Menu
      trigger={trigger}
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
