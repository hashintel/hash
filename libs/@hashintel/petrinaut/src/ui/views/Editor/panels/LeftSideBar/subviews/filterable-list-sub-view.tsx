import { Fragment, use, useRef, useState } from "react";

import { Button, Icon, Menu, type MenuItem } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { focusLands } from "../../../../../worksheet/focus-flow";
import { useFocusStops } from "../../../../../worksheet/use-focus-stops";
import { RowActionCell } from "./row-action-cell";

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
    cursor: "pointer",
    transition: "[background-color 100ms ease-out, opacity 150ms ease-out]",

    /* Focus shows as a background change, like hover. */
    _focus: {
      outline: "none",
      backgroundColor: "neutral.s25",
    },

    /* The action button shows on hover, while the row or the button holds
       focus, or while its menu is open. Hidden with `display` so it takes no
       width until shown. */
    "& [data-row-action]": {
      display: "none",
    },
    "&:hover [data-row-action], &:focus-within [data-row-action], & [data-row-action]:has([data-state=open])":
      {
        display: "flex",
      },
  },
  variants: {
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
      false: {
        _hover: {
          backgroundColor: "neutral.bg.surface.hover",
        },
        "&:has([data-row-action] [data-state=open])": {
          backgroundColor: "neutral.bg.surface.hover",
        },
      },
    },
  },
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

interface VisibleRow<T> {
  item: T;
  isGroup: boolean;
}

/** The rows the keyboard flow walks, in document order; a collapsed group hides its children. */
const visibleRowsOf = <T extends FilterableListItem>(
  items: T[],
  collapsedGroups: Set<string>,
): VisibleRow<T>[] =>
  items.flatMap((item): VisibleRow<T>[] => {
    const children = item.children as T[] | undefined;
    if (children === undefined) {
      return [{ item, isGroup: false }];
    }
    const visibleChildren = collapsedGroups.has(item.id) ? [] : children;
    return [
      { item, isGroup: true },
      ...visibleChildren.map((child) => ({ item: child, isGroup: false })),
    ];
  });

const FilterableListContent = <T extends FilterableListItem>({
  items,
  getSelectionItem,
  renderItem,
  renderRowMenu: RenderRowMenu,
  emptyMessage,
}: {
  items: T[];
  getSelectionItem: (item: T) => SelectionItem;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  renderRowMenu?: ComponentType<{ item: T }>;
  emptyMessage: string;
}) => {
  const {
    isSelected: checkIsSelected,
    selectItem,
    toggleItem,
    clearSelection,
    setSelection,
  } = use(EditorContext);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  // The Shift-range anchor: the item the last plain selection landed on.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const targets = useRef<Map<string, HTMLElement>>(new Map());

  const visibleRows = visibleRowsOf(items, collapsedGroups);
  const stops: FocusStop[] = visibleRows.map((row) => ({
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
    // Column 0 is the row, column 1 its action button (menu or add).
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

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(groupId)) {
        next.add(groupId);
      }
      return next;
    });
  };

  const select = (item: T) => {
    selectItem(getSelectionItem(item));
    setAnchorId(item.id);
  };

  const selectRange = (toId: string) => {
    const ids = visibleRows.map((row) => row.item.id);
    const toIndex = ids.indexOf(toId);
    if (toIndex === -1) {
      return;
    }
    const anchorIndex = anchorId === null ? -1 : ids.indexOf(anchorId);
    const fromIndex = anchorIndex === -1 ? toIndex : anchorIndex;
    const selection: SelectionMap = new Map();
    for (const row of visibleRows.slice(
      Math.min(fromIndex, toIndex),
      Math.max(fromIndex, toIndex) + 1,
    )) {
      if (!row.isGroup) {
        const entry = getSelectionItem(row.item);
        selection.set(entry.id, entry);
      }
    }
    setSelection(selection);
  };

  /** Arrows select as they move: apply the selection to the row that took focus. */
  const selectFocusedRow = (extendRange: boolean) => {
    const landed = visibleRows.find(
      (row) =>
        targets.current.get(targetKey({ stopId: row.item.id, column: 0 })) ===
        document.activeElement,
    );
    if (!landed || landed.isGroup) {
      return;
    }
    if (extendRange) {
      selectRange(landed.item.id);
    } else {
      select(landed.item);
    }
  };

  const onRowKeyDown =
    (row: VisibleRow<T>): React.KeyboardEventHandler =>
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        if (row.isGroup) {
          toggleGroup(row.item.id);
        } else {
          select(row.item);
        }
        return;
      }
      // A group header owns the horizontal arrow that changes its state; the
      // other one falls through to the flow (ArrowRight on an expanded group
      // reaches its action button).
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
      onStopsKeyDown({ stopId: row.item.id, column: 0 })(event);
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        selectFocusedRow(event.shiftKey);
      }
    };

  const onRowClick = (event: React.MouseEvent, row: VisibleRow<T>) => {
    event.stopPropagation();
    if (row.isGroup) {
      toggleGroup(row.item.id);
    } else if (event.shiftKey && anchorId !== null) {
      selectRange(row.item.id);
    } else if (event.metaKey || event.ctrlKey) {
      toggleItem(getSelectionItem(row.item));
      setAnchorId(row.item.id);
    } else {
      select(row.item);
    }
  };

  const clear = () => {
    clearSelection();
    setAnchorId(null);
  };

  // A collapsed group's children stay mounted for the height animation; they
  // are out of `stops`, so `tabIndexFor` keeps them out of the tab order.
  const renderRow = (item: T, depth: number, isGroup: boolean) => {
    const row: VisibleRow<T> = { item, isGroup };
    const selected = !isGroup && checkIsSelected(item.id);
    const rowTarget: FocusStopTarget = { stopId: item.id, column: 0 };
    const actionTarget: FocusStopTarget = { stopId: item.id, column: 1 };
    const action = isGroup ? (
      item.renderGroupAction ? (
        <item.renderGroupAction />
      ) : null
    ) : RenderRowMenu ? (
      <RenderRowMenu item={item} />
    ) : null;

    return (
      <div
        key={item.id}
        role="option"
        aria-selected={selected}
        ref={registerTarget(rowTarget)}
        tabIndex={tabIndexFor(rowTarget)}
        className={listItemRowStyle({ isSelected: selected })}
        style={
          depth > 0 ? { paddingLeft: depth * NESTING_INDENT + 4 } : undefined
        }
        onClick={(event) => onRowClick(event, row)}
        onKeyDown={onRowKeyDown(row)}
        onFocus={(event) => {
          // Focus bubbles: the row reports its own position, its action
          // button reports through the cell.
          if (event.target === event.currentTarget) {
            onFocusTarget(rowTarget);
          }
        }}
      >
        <div className={listItemContentStyle}>
          {isGroup ? (
            <span
              className={chevronStyle({
                expanded: !collapsedGroups.has(item.id),
              })}
            >
              <Icon name="chevronRight" size="xxs" />
            </span>
          ) : null}
          {item.icon ? (
            <span
              className={listItemIconStyle}
              style={{ color: item.iconColor ?? LIST_ITEM_ICON_COLOR }}
            >
              <item.icon size={LIST_ITEM_ICON_SIZE} />
            </span>
          ) : null}
          <div className={listItemNameStyle}>{renderItem(item, selected)}</div>
        </div>
        {action ? (
          <RowActionCell
            registerButton={registerTarget(actionTarget)}
            onArrowKeyDown={onStopsKeyDown(actionTarget)}
            onButtonFocus={() => onFocusTarget(actionTarget)}
          >
            {action}
          </RowActionCell>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={attach}
      className={listContainerStyle}
      role="listbox"
      aria-multiselectable="true"
      tabIndex={-1}
      onClick={clear}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clear();
        }
      }}
    >
      {items.length === 0 ? (
        <div className={emptyMessageStyle}>{emptyMessage}</div>
      ) : (
        items.map((item) => {
          const children = item.children as T[] | undefined;
          if (children === undefined) {
            return renderRow(item, 0, false);
          }
          const collapsed = collapsedGroups.has(item.id);
          return (
            <Fragment key={item.id}>
              {renderRow(item, 0, true)}
              <div
                className={groupChildrenStyle}
                style={{ height: collapsed ? 0 : "auto" }}
              >
                {children.length > 0 ? (
                  children.map((child) => renderRow(child, 1, false))
                ) : item.emptyGroupMessage ? (
                  <div
                    className={emptyMessageStyle}
                    style={{ paddingLeft: NESTING_INDENT + 4 }}
                  >
                    {item.emptyGroupMessage}
                  </div>
                ) : null}
              </div>
            </Fragment>
          );
        })
      )}
    </div>
  );
};

/**
 * A left-sidebar list of selectable items with a search button in its header,
 * an optional extra header action, and per-row menus.
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
