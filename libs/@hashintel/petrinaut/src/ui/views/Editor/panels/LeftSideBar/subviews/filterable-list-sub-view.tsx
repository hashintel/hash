import { Fragment, use, useRef, useState } from "react";

import { Button, Icon, Menu, type MenuItem } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { focusLands } from "../../../../../worksheet/focus-flow";
import { useFocusStops } from "../../../../../worksheet/use-focus-stops";
import { RowActionSlot } from "./row-action-slot";

import type {
  SubView,
  SubViewResizeConfig,
} from "../../../../../components/sub-view/types";
import type {
  FocusStop,
  FocusStopTarget,
} from "../../../../../worksheet/use-focus-stops";
import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";
import type { ComponentType, ReactNode } from "react";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  flex: "[1]",
  /** Reduce horizontal padding from the parent */
  mx: "-1",
  /** Enable animating height to/from `auto` for collapsible group children */
  interpolateSize: "[allow-keywords]",
});

/** Wrapper around a group's children that animates height on collapse/expand */
const groupChildrenStyle = css({
  overflow: "hidden",
  transition: "[height 150ms ease-out]",
});

const listItemRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s115",
    backgroundColor: "[transparent]",

    transition: "[background-color 100ms ease-out, opacity 150ms ease-out]",
  },
  variants: {
    selectable: {
      true: {
        cursor: "pointer",

        /* Focus is shown as a background change, matching the hover treatment */
        _focus: {
          outline: "none",
          backgroundColor: "neutral.s25",
        },

        /* Reveal the action slot on hover, while the row or the slot holds
           focus, or while its menu is open. Hidden with `display` rather than
           `opacity` so it takes no space and the label keeps the full row
           width until the slot is shown. */
        "& [data-row-action]": {
          display: "none",
        },
        "&:hover [data-row-action], &:focus-within [data-row-action], & [data-row-action]:has([data-state=open]), & [data-row-action][data-state=open]":
          {
            display: "flex",
          },
      },
    },
    isSelected: {
      true: {
        backgroundColor: "blue.s30",
        _focus: {
          backgroundColor: "blue.s40",
        },
        "&:has([data-row-action] [data-state=open])": {
          backgroundColor: "blue.s40",
        },
      },
      false: {},
    },
  },
  compoundVariants: [
    {
      selectable: true,
      isSelected: false,
      css: {
        _hover: {
          backgroundColor: "neutral.bg.surface.hover",
        },
        "&:has([data-row-action] [data-state=open])": {
          backgroundColor: "neutral.bg.surface.hover",
        },
      },
    },
  ],
});

const listItemContentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "[1]",
  minWidth: "[0]",
});

const listItemNameStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "snug",
  color: "neutral.s115",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  /* renderItem may nest its own lines (e.g. a name with a subtitle); each
     line truncates the same way plain-text items do. */
  "& *": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const LIST_ITEM_ICON_SIZE = 12;
const LIST_ITEM_ICON_COLOR = "#9ca3af";

const listItemIconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const chevronStyle = cva({
  base: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "[transform 150ms ease-out]",
    color: "neutral.s80",
  },
  variants: {
    expanded: {
      true: { transform: "rotate(90deg)" },
      false: { transform: "rotate(0deg)" },
    },
  },
});

const NESTING_INDENT = 16;

const emptyMessageStyle = css({
  pt: "1",
  px: "1",
  fontSize: "sm",
  color: "neutral.s65",
});

interface FilterableListItem {
  id: string;
  icon?: ComponentType<{ size: number }>;
  iconColor?: string;
  /** When present, this item becomes a collapsible group header. */
  children?: FilterableListItem[];
  /** Message shown when this group is expanded but has no children. */
  emptyGroupMessage?: string;
  /** Optional action component shown on the right side of a group row (e.g. an add button). */
  renderGroupAction?: ComponentType;
}

interface FilterableListSubViewConfig<T extends FilterableListItem> {
  id: string;
  title: string;
  tooltip?: string;
  defaultCollapsed?: boolean;
  resizable?: SubViewResizeConfig;
  useItems: () => T[];
  getSelectionItem: (item: T) => SelectionItem;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  /** Component to render the row's ellipsis menu. Receives the item as a prop.
   *  Use `RowMenu` helper to render the shared menu chrome. */
  renderRowMenu?: ComponentType<{ item: T }>;
  emptyMessage: string;
  renderHeaderAction?: () => ReactNode;
}

const FilterHeaderAction: React.FC<{
  renderExtraAction?: () => ReactNode;
}> = ({ renderExtraAction }) => {
  const { setSearchOpen } = use(EditorContext);

  return (
    <>
      <Button
        aria-label="Search list"
        tooltip="Search list"
        size="xs"
        variant="ghost"
        iconName="search"
        onClick={() => setSearchOpen(true)}
      />
      {renderExtraAction?.()}
    </>
  );
};

/**
 * Shared row menu chrome. Consumers call hooks in their own `renderRowMenu`
 * component and pass the resulting items here.
 */
export const RowMenu: React.FC<{ items: MenuItem[] }> = ({ items }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <Menu
      trigger={
        <Button
          aria-label="More options"
          tooltip="More options"
          size="xxs"
          variant="ghost"
          iconName="ellipsis"
          onClick={(event) => event.stopPropagation()}
        />
      }
      items={items}
      position="right"
    />
  );
};

const targetKey = (target: FocusStopTarget): string =>
  `${target.stopId}:${target.column}`;

const NonEmptyFilterableListContent = <T extends FilterableListItem>({
  items,
  getSelectionItem,
  renderItem,
  renderRowMenu: RenderRowMenu,
  collapsedGroups,
  toggleGroup,
}: {
  items: T[];
  getSelectionItem: (item: T) => SelectionItem;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  renderRowMenu?: ComponentType<{ item: T }>;
  collapsedGroups: Set<string>;
  toggleGroup: (groupId: string) => void;
}) => {
  const {
    isSelected: checkIsSelected,
    selectItem,
    toggleItem,
    clearSelection,
    setSelection,
  } = use(EditorContext);

  // The Shift-range anchor: the item the last plain selection landed on.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const targets = useRef<Map<string, HTMLElement>>(new Map());

  // Flatten tree: items with children become group header + child rows.
  // Children are always included (even when collapsed) so the DOM stays
  // stable for height animation. The `hidden` flag marks collapsed children
  // so they stay out of the keyboard flow.
  const flatRows: {
    item: T;
    depth: number;
    isGroup: boolean;
    hidden: boolean;
    emptyGroupMessage?: string;
  }[] = [];
  for (const item of items) {
    const children = item.children as T[] | undefined;
    const isGroup = children !== undefined;
    flatRows.push({ item, depth: 0, isGroup, hidden: false });
    if (isGroup) {
      const isCollapsed = collapsedGroups.has(item.id);
      if (children!.length > 0) {
        for (const child of children!) {
          flatRows.push({
            item: child,
            depth: 1,
            isGroup: false,
            hidden: isCollapsed,
          });
        }
      } else if (item.emptyGroupMessage) {
        flatRows.push({
          item,
          depth: 1,
          isGroup: false,
          hidden: isCollapsed,
          emptyGroupMessage: item.emptyGroupMessage,
        });
      }
    }
  }

  // The rows the keyboard flow walks, in document order.
  const focusableRows = flatRows.filter(
    (row) => !row.hidden && !row.emptyGroupMessage,
  );
  const stops: FocusStop[] = focusableRows.map((row) => ({
    id: row.item.id,
    kind: "row",
  }));

  const {
    onKeyDown: onStopsKeyDown,
    onFocusTarget,
    tabIndexFor,
    attach,
  } = useFocusStops({
    stops,
    // Column 0 is the row itself; column 1 its action slot (menu / add).
    columnCount: 2,
    focusTarget: (target) => focusLands(targets.current.get(targetKey(target))),
  });

  const registerTarget =
    (target: FocusStopTarget) => (element: HTMLElement | null) => {
      if (element) {
        targets.current.set(targetKey(target), element);
      } else {
        targets.current.delete(targetKey(target));
      }
    };

  const selectRange = (fromId: string | null, toId: string) => {
    const ids = focusableRows.map((row) => row.item.id);
    const toIndex = ids.indexOf(toId);
    if (toIndex === -1) {
      return;
    }
    const fromIndex = fromId === null ? toIndex : ids.indexOf(fromId);
    const start = Math.min(fromIndex === -1 ? toIndex : fromIndex, toIndex);
    const end = Math.max(fromIndex === -1 ? toIndex : fromIndex, toIndex);
    const newSelection: SelectionMap = new Map();
    for (let i = start; i <= end; i++) {
      const row = focusableRows[i]!;
      if (!row.isGroup) {
        const selItem = getSelectionItem(row.item);
        newSelection.set(selItem.id, selItem);
      }
    }
    setSelection(newSelection);
  };

  /** Arrows select as they move: sync the selection to wherever focus landed. */
  const selectFollowingFocus = (extendRange: boolean) => {
    const active = document.activeElement;
    const landed = focusableRows.find(
      (row) => targets.current.get(`${row.item.id}:0`) === active,
    );
    if (!landed || landed.isGroup) {
      return;
    }
    if (extendRange) {
      selectRange(anchorId, landed.item.id);
    } else {
      selectItem(getSelectionItem(landed.item));
      setAnchorId(landed.item.id);
    }
  };

  const onRowKeyDown =
    (row: (typeof flatRows)[number]): React.KeyboardEventHandler =>
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        if (row.isGroup) {
          toggleGroup(row.item.id);
        } else {
          selectItem(getSelectionItem(row.item));
          setAnchorId(row.item.id);
        }
        return;
      }
      // A group header owns the horizontal arrow that changes its state;
      // the other direction falls through to the flow (ArrowRight on an
      // expanded group walks to its action slot).
      if (
        row.isGroup &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        const collapsed = collapsedGroups.has(row.item.id);
        if (event.key === "ArrowRight" ? collapsed : !collapsed) {
          event.preventDefault();
          event.stopPropagation();
          toggleGroup(row.item.id);
          return;
        }
      }
      const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
      onStopsKeyDown({ stopId: row.item.id, column: 0 })(event);
      if (vertical) {
        selectFollowingFocus(event.shiftKey);
      }
    };

  const handleRowClick = (
    event: React.MouseEvent,
    row: { item: T; isGroup: boolean },
  ) => {
    event.stopPropagation();

    if (row.isGroup) {
      toggleGroup(row.item.id);
      return;
    }

    const selectionItem = getSelectionItem(row.item);
    if (event.shiftKey && anchorId !== null) {
      selectRange(anchorId, row.item.id);
    } else if (event.metaKey || event.ctrlKey) {
      toggleItem(selectionItem);
      setAnchorId(row.item.id);
    } else {
      selectItem(selectionItem);
      setAnchorId(row.item.id);
    }
  };

  const handleContainerClick = () => {
    clearSelection();
    setAnchorId(null);
  };

  return (
    <div
      ref={attach}
      className={listContainerStyle}
      role="listbox"
      aria-multiselectable="true"
      tabIndex={-1}
      onClick={handleContainerClick}
      onKeyDown={(event) => {
        // Bubbled from the rows, which do not handle Escape themselves.
        if (event.key === "Escape") {
          clearSelection();
          setAnchorId(null);
        }
      }}
    >
      {items.map((topItem) => {
        const children = topItem.children as T[] | undefined;
        const isGroup = children !== undefined;
        const isCollapsed = isGroup && collapsedGroups.has(topItem.id);

        const itemRow = (item: T, depth: number) => {
          const row = flatRows.find(
            (candidate) => candidate.item === item && candidate.depth === depth,
          )!;
          const isItemGroup = item === topItem && isGroup;
          const selected = !isItemGroup && checkIsSelected(item.id);
          const inFlow = !row.hidden;
          const rowTarget: FocusStopTarget = { stopId: item.id, column: 0 };
          const actionTarget: FocusStopTarget = { stopId: item.id, column: 1 };

          return (
            <div
              key={`${depth}-${item.id}`}
              ref={inFlow ? registerTarget(rowTarget) : undefined}
              onClick={(event) =>
                handleRowClick(event, {
                  item,
                  isGroup: isItemGroup,
                })
              }
              onKeyDown={inFlow ? onRowKeyDown(row) : undefined}
              onFocus={
                inFlow
                  ? (event) => {
                      // Focus bubbles: only the row itself, not its action
                      // slot, reports the row position.
                      if (event.target === event.currentTarget) {
                        onFocusTarget(rowTarget);
                      }
                    }
                  : undefined
              }
              role="option"
              tabIndex={inFlow ? tabIndexFor(rowTarget) : -1}
              aria-selected={selected}
              className={listItemRowStyle({
                selectable: true,
                isSelected: selected,
              })}
              style={
                depth > 0
                  ? { paddingLeft: depth * NESTING_INDENT + 4 }
                  : undefined
              }
            >
              <div className={listItemContentStyle}>
                {isItemGroup && (
                  <span className={chevronStyle({ expanded: !isCollapsed })}>
                    <Icon name="chevronRight" size="xxs" />
                  </span>
                )}
                {item.icon && (
                  <span
                    className={listItemIconStyle}
                    style={{
                      color: item.iconColor ?? LIST_ITEM_ICON_COLOR,
                    }}
                  >
                    <item.icon size={LIST_ITEM_ICON_SIZE} />
                  </span>
                )}
                <div className={listItemNameStyle}>
                  {renderItem(item, selected)}
                </div>
              </div>
              {isItemGroup && item.renderGroupAction && (
                <RowActionSlot
                  registerButton={registerTarget(actionTarget)}
                  onArrowKeyDown={onStopsKeyDown(actionTarget)}
                  onButtonFocus={() => onFocusTarget(actionTarget)}
                >
                  <item.renderGroupAction />
                </RowActionSlot>
              )}
              {!isItemGroup && RenderRowMenu && (
                <RowActionSlot
                  registerButton={registerTarget(actionTarget)}
                  onArrowKeyDown={onStopsKeyDown(actionTarget)}
                  onButtonFocus={() => onFocusTarget(actionTarget)}
                >
                  <RenderRowMenu item={item} />
                </RowActionSlot>
              )}
            </div>
          );
        };

        if (!isGroup) {
          return itemRow(topItem, 0);
        }

        return (
          <Fragment key={topItem.id}>
            {itemRow(topItem, 0)}
            <div
              className={groupChildrenStyle}
              style={{ height: isCollapsed ? 0 : "auto" }}
            >
              {children!.length > 0
                ? children!.map((child) => itemRow(child, 1))
                : topItem.emptyGroupMessage && (
                    <div
                      className={listItemRowStyle({
                        selectable: false,
                        isSelected: false,
                      })}
                      style={{ paddingLeft: NESTING_INDENT + 4 }}
                    >
                      <div className={listItemContentStyle}>
                        <div
                          className={listItemNameStyle}
                          style={{ color: "var(--colors-neutral-s65)" }}
                        >
                          {topItem.emptyGroupMessage}
                        </div>
                      </div>
                    </div>
                  )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
};

const FilterableListContent = <T extends FilterableListItem>({
  items,
  getSelectionItem,
  renderItem,
  renderRowMenu,
  emptyMessage,
}: {
  items: T[];
  getSelectionItem: (item: T) => SelectionItem;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  renderRowMenu?: ComponentType<{ item: T }>;
  emptyMessage: string;
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <div
        className={listContainerStyle}
        role="listbox"
        aria-multiselectable="true"
      >
        <div className={emptyMessageStyle}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <NonEmptyFilterableListContent
      items={items}
      getSelectionItem={getSelectionItem}
      renderItem={renderItem}
      renderRowMenu={renderRowMenu}
      collapsedGroups={collapsedGroups}
      toggleGroup={toggleGroup}
    />
  );
};

/**
 * Creates a SubView definition for a filterable list.
 *
 * This factory function encapsulates the common pattern of a list of selectable items
 * with a filter button in the header. Each subview can optionally provide an additional
 * header action (e.g., an "Add" button) and customize how items are rendered.
 */
export function createFilterableListSubView<T extends FilterableListItem>(
  config: FilterableListSubViewConfig<T>,
): SubView {
  const {
    id,
    title,
    tooltip,
    defaultCollapsed,
    resizable,
    useItems,
    getSelectionItem,
    renderItem,
    renderRowMenu,
    emptyMessage,
    renderHeaderAction: renderExtraAction,
  } = config;

  const Component: React.FC = () => {
    const items = useItems();
    return (
      <FilterableListContent
        items={items}
        getSelectionItem={getSelectionItem}
        renderItem={renderItem}
        renderRowMenu={renderRowMenu}
        emptyMessage={emptyMessage}
      />
    );
  };

  return {
    id,
    title,
    tooltip,
    component: Component,
    renderHeaderAction: () => (
      <FilterHeaderAction renderExtraAction={renderExtraAction} />
    ),
    defaultCollapsed,
    resizable,
  };
}
