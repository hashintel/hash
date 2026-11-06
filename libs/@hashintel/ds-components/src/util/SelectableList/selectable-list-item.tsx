import { cx } from "@hashintel/ds-helpers/css";

import { Icon } from "../../components/Icon/icon";
import { LoadingSpinner } from "../../components/Loading/loading-spinner";
import {
  checkIconSizeMap,
  arrowIconSizeMap,
  iconSizeMap,
  indentUnitPx,
} from "./selectable-list-item.recipe";
import { isCollapsibleItem } from "./selectable-list-util";

import type { FormInputSize } from "../form-shared";
import type { ItemClasses } from "./selectable-list-item.recipe";
import type { Item } from "./selectable-list-util";

const SelectionIndicator = ({
  style,
  selected,
  classes,
  size,
}: {
  style: NonNullable<Item["selectedStyle"]>;
  selected: boolean;
  classes: ItemClasses;
  size: FormInputSize;
}) => {
  if (style === "highlight") {
    return null;
  }

  if (style === "tick") {
    return (
      <span className={cx(classes.indicator, classes.tick)} aria-hidden="true">
        {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
      </span>
    );
  }

  if (style === "radio") {
    return (
      <span
        className={cx(classes.indicator, classes.radio)}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={cx(classes.indicator, classes.checkbox)}
      aria-hidden="true"
    >
      {selected ? <Icon name="check" size={checkIconSizeMap[size]} /> : null}
    </span>
  );
};

export const ItemBody = ({
  item,
  size,
  isSelected,
  classes,
  expanded = false,
  containsSelection = false,
  onToggleExpansion,
  reserveChevron = false,
}: {
  item: Item;
  size: FormInputSize;
  isSelected: boolean;
  classes: ItemClasses;
  /** Whether a collapsible item's subItems are currently revealed */
  expanded?: boolean;
  /** Whether a selected item hides inside this collapsed item's subtree */
  containsSelection?: boolean;
  /** Toggles a collapsible item between expanded and collapsed */
  onToggleExpansion?: () => void;
  /** Whether the row keeps an empty chevron column, aligning it with the list's collapsible rows */
  reserveChevron?: boolean;
}) => {
  const selectedStyle = item.selectedStyle ?? "highlight";
  const indent = item.indent ?? 0;

  const indentSpacer = indent > 0 && (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: `${indent * indentUnitPx[size]}px`,
        flexShrink: 0,
      }}
    />
  );
  const spinner = item.loading && (
    <LoadingSpinner
      size={iconSizeMap[size]}
      variant="bars"
      className={classes.spinner}
    />
  );
  const selectionIndicator = (
    <SelectionIndicator
      style={selectedStyle}
      selected={isSelected}
      classes={classes}
      size={size}
    />
  );

  return (
    <>
      {isCollapsibleItem(item) ? (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={
              expanded
                ? "Collapse"
                : containsSelection
                  ? "Expand (contains selected items)"
                  : "Expand"
            }
            data-collapsible-toggle=""
            className={classes.collapseHit}
            onPointerDown={(event) => event.stopPropagation()}
            // preventDefault lives here, not on pointerdown: it keeps focus
            // where it is (e.g. a search input), while on pointerdown it
            // would suppress the compatibility click on touch/pen, leaving
            // the chevron dead there.
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpansion?.();
            }}
          >
            {indentSpacer}
            <span
              className={cx(classes.indicator, classes.collapseChevron)}
              aria-hidden="true"
            >
              <Icon name="chevronRight" size={checkIconSizeMap[size]} />
            </span>
          </button>
          {selectionIndicator}
          {spinner}
        </>
      ) : (
        <>
          {indentSpacer}
          {spinner}
          {reserveChevron && (
            <span className={classes.indicator} aria-hidden="true" />
          )}
          {selectionIndicator}
        </>
      )}
      {item.icon && (
        <Icon
          name={item.icon}
          size={iconSizeMap[size]}
          className={classes.icon}
        />
      )}
      <span className={classes.textColumn}>
        {typeof item.text === "string" ? (
          item.text
        ) : (
          <span className={classes.customText}>{item.text}</span>
        )}
        {item.description !== undefined && item.description !== null && (
          <span className={classes.description}>{item.description}</span>
        )}
      </span>
      {!isCollapsibleItem(item) &&
        item.subItems &&
        item.subItems.length > 0 && (
          <Icon
            name="chevronRight"
            size={arrowIconSizeMap[size]}
            className={classes.arrow}
            aria-hidden="true"
          />
        )}
      {item.suffix && <span className={classes.suffix}>{item.suffix}</span>}
    </>
  );
};
