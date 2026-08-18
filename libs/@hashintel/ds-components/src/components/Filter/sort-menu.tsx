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
import {
  directionSuffix,
  directionToggle,
  menuContent,
  placeholderLabel,
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
 * A dropdown for choosing how a collection is sorted, triggered by a
 * `Button` (all button props are accepted and forwarded). The dropdown
 * lists the given sorters; selecting one (click or Enter) fires `onChange`
 * with the direction its row shows, and closes the menu. A row's direction
 * appears when the row is active, hovered or keyboard-highlighted; sorters
 * offering both directions show it as a toggle. Clicking the toggle — or
 * pressing left/right on the highlighted row — only flips the direction the
 * row displays: nothing is committed (and the trigger does not change) until
 * a selection is made, and closing the menu discards the adjustment.
 *
 * When the active sorter offers both directions, the trigger's own direction
 * icon is also a toggle: clicking it fires `onChange` with the flipped
 * direction immediately, without opening the menu.
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
} & DistributedOmit<
  ButtonElementProps,
  "children" | "pressed" | "onClick" | "type"
>) => {
  // Uncommitted directions set with the row toggles or the arrow keys: they
  // adjust what selecting a row would apply, without selecting it.
  const [draftDirections, setDraftDirections] = useState<
    Partial<Record<SortKey, SortDirection>>
  >({});

  const commit = (sortKey: SortKey, direction: SortDirection) => {
    setDraftDirections({});
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

  // Flip the direction a row displays without committing anything.
  const flipShownDirection = (sorter: Sorter<SortKey>) => {
    const next = flipped(shownDirection(sorter));
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
      setDraftDirections({});
      return;
    }
    commit(sorter.sortKey, direction);
  };

  // Left/right arrows flip the highlighted row's displayed direction; the
  // change only takes effect when the row is selected.
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
    flipShownDirection(sorter);
  };

  const menuItems = items.map((sorter): MenuItem => {
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
              flipShownDirection(sorter);
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
        }
      }}
      onKeyDown={handleContentKeyDown}
    />
  );
};
