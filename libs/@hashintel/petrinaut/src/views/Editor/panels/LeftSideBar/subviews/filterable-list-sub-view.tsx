import { css, cva } from "@hashintel/ds-helpers/css";
import type { ComponentType, ReactNode } from "react";
import { use, useEffect, useRef, useState } from "react";
import { LuChevronRight, LuSearch } from "react-icons/lu";
import { TbDots } from "react-icons/tb";

import { IconButton } from "../../../../../components/icon-button";
import type { MenuItem } from "../../../../../components/menu";
import { Menu } from "../../../../../components/menu";
import type {
  SubView,
  SubViewResizeConfig,
} from "../../../../../components/sub-view/types";
import { EditorContext } from "../../../../../state/editor-context";
import type {
  SelectionItem,
  SelectionMap,
} from "../../../../../state/selection";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  flex: "[1]",
  /** Reduce horizontal padding from the parent */
  mx: "-1",
  /** Suppress browser default focus ring — focus is shown per-row via isFocused variant */
  outline: "none",
});

const listItemRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    cursor: "pointer",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s115",

    transition: "[background-color 100ms ease-out, opacity 150ms ease-out]",

    /* Reveal the action button on hover or when its menu is open */
    "& [data-row-action]": {
      opacity: "[0]",
      transition: "[opacity 150ms ease-out]",
    },
    "& [data-row-action] svg": {
      transform: "[translateX(2px)]",
      transition: "[transform 150ms ease-out]",
    },
    "&:hover [data-row-action], & [data-row-action][data-state=open]": {
      opacity: "[1]",
    },
    "&:hover [data-row-action] svg, & [data-row-action][data-state=open] svg": {
      transform: "none",
    },
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "neutral.bg.subtle",
        _hover: {
          backgroundColor: "neutral.bg.subtle.hover",
        },
        "&:has([data-row-action][data-state=open])": {
          backgroundColor: "neutral.bg.subtle.hover",
        },
      },
      false: {
        backgroundColor: "[transparent]",
        _hover: {
          backgroundColor: "neutral.bg.surface.hover",
        },
        "&:has([data-row-action][data-state=open])": {
          backgroundColor: "neutral.bg.surface.hover",
        },
      },
    },
    isFocused: {
      true: {
        backgroundColor: "neutral.bg.subtle.hover",
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
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "snug",
  color: "neutral.s115",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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

const CHEVRON_SIZE = 10;
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
}

interface FilterableListSubViewConfig<T extends FilterableListItem> {
  id: string;
  title: string;
  tooltip?: string;
  defaultCollapsed?: boolean;
  resizable?: SubViewResizeConfig;
  /** When true, the panel's maximum height is determined by its content. */
  fitContent?: boolean;
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
      <IconButton
        aria-label="Search list"
        size="xs"
        onClick={() => setSearchOpen(true)}
      >
        <LuSearch />
      </IconButton>
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
      animated
      trigger={
        <IconButton
          aria-label="More options"
          size="xxs"
          data-row-action
          onClick={(event) => event.stopPropagation()}
        >
          <TbDots />
        </IconButton>
      }
      items={items}
      placement="bottom-end"
    />
  );
};

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

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Flatten tree: items with children become group header + child rows
  const flatRows: { item: T; depth: number; isGroup: boolean }[] = [];
  for (const item of items) {
    const children = item.children as T[] | undefined;
    const isGroup = children !== undefined;
    flatRows.push({ item, depth: 0, isGroup });
    if (isGroup && !collapsedGroups.has(item.id)) {
      for (const child of children!) {
        flatRows.push({ item: child, depth: 1, isGroup: false });
      }
    }
  }

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

  // Clamp focus/anchor when visible rows change and truncate stale row refs
  useEffect(() => {
    rowRefs.current.length = flatRows.length;
    if (flatRows.length === 0) {
      setFocusedIndex(null);
      setAnchorIndex(null);
    } else {
      setFocusedIndex((prev) =>
        prev !== null ? Math.min(prev, flatRows.length - 1) : prev,
      );
      setAnchorIndex((prev) =>
        prev !== null ? Math.min(prev, flatRows.length - 1) : prev,
      );
    }
  }, [flatRows.length]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex !== null) {
      rowRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedIndex]);

  const selectRange = (fromIndex: number | null, toIndex: number) => {
    const start = Math.min(fromIndex ?? toIndex, toIndex);
    const end = Math.max(fromIndex ?? toIndex, toIndex);
    const newSelection: SelectionMap = new Map();
    for (let i = start; i <= end; i++) {
      const row = flatRows[i];
      if (row && !row.isGroup) {
        const selItem = getSelectionItem(row.item);
        newSelection.set(selItem.id, selItem);
      }
    }
    setSelection(newSelection);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Ignore key events bubbling from nested interactive controls (e.g. row menu buttons)
    if (event.target !== event.currentTarget) {
      return;
    }
    if (flatRows.length === 0) {
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const nextIndex =
          focusedIndex === null
            ? 0
            : Math.min(focusedIndex + 1, flatRows.length - 1);
        setFocusedIndex(nextIndex);
        const row = flatRows[nextIndex];
        if (row && !row.isGroup) {
          if (event.shiftKey) {
            selectRange(anchorIndex ?? nextIndex, nextIndex);
          } else {
            selectItem(getSelectionItem(row.item));
            setAnchorIndex(nextIndex);
          }
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const nextIndex =
          focusedIndex === null
            ? flatRows.length - 1
            : Math.max(focusedIndex - 1, 0);
        setFocusedIndex(nextIndex);
        const row = flatRows[nextIndex];
        if (row && !row.isGroup) {
          if (event.shiftKey) {
            selectRange(anchorIndex ?? nextIndex, nextIndex);
          } else {
            selectItem(getSelectionItem(row.item));
            setAnchorIndex(nextIndex);
          }
        }
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (focusedIndex !== null) {
          const row = flatRows[focusedIndex];
          if (row) {
            if (row.isGroup) {
              toggleGroup(row.item.id);
            } else {
              selectItem(getSelectionItem(row.item));
              setAnchorIndex(focusedIndex);
            }
          }
        }
        break;
      }
      case "ArrowRight": {
        if (focusedIndex !== null) {
          const row = flatRows[focusedIndex];
          if (row?.isGroup && collapsedGroups.has(row.item.id)) {
            event.preventDefault();
            toggleGroup(row.item.id);
          }
        }
        break;
      }
      case "ArrowLeft": {
        if (focusedIndex !== null) {
          const row = flatRows[focusedIndex];
          if (row?.isGroup && !collapsedGroups.has(row.item.id)) {
            event.preventDefault();
            toggleGroup(row.item.id);
          }
        }
        break;
      }
      case "Escape": {
        clearSelection();
        setFocusedIndex(null);
        setAnchorIndex(null);
        break;
      }
    }
  };

  const handleContainerClick = () => {
    clearSelection();
    setFocusedIndex(null);
    setAnchorIndex(null);
  };

  const handleRowClick = (
    event: React.MouseEvent,
    index: number,
    row: { item: T; isGroup: boolean },
  ) => {
    event.stopPropagation();
    setFocusedIndex(index);

    if (row.isGroup) {
      toggleGroup(row.item.id);
      return;
    }

    const selectionItem = getSelectionItem(row.item);
    if (event.shiftKey && anchorIndex !== null) {
      selectRange(anchorIndex, index);
    } else if (event.metaKey || event.ctrlKey) {
      toggleItem(selectionItem);
      setAnchorIndex(index);
    } else {
      selectItem(selectionItem);
      setAnchorIndex(index);
    }
  };

  return (
    <div
      ref={containerRef}
      className={listContainerStyle}
      role="listbox"
      aria-multiselectable="true"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleContainerClick}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusedIndex(null);
          setAnchorIndex(null);
        }
      }}
    >
      {flatRows.map(({ item, depth, isGroup }, index) => {
        const isSelected = !isGroup && checkIsSelected(item.id);
        const isFocused = focusedIndex === index;
        const isCollapsed = isGroup && collapsedGroups.has(item.id);

        return (
          <div
            key={`${depth}-${item.id}`}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            onClick={(event) => handleRowClick(event, index, { item, isGroup })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                if (isGroup) {
                  toggleGroup(item.id);
                } else {
                  selectItem(getSelectionItem(item));
                  setFocusedIndex(index);
                  setAnchorIndex(index);
                }
              }
            }}
            role="option"
            aria-selected={isSelected}
            className={listItemRowStyle({ isSelected, isFocused })}
            style={
              depth > 0
                ? { paddingLeft: depth * NESTING_INDENT + 4 }
                : undefined
            }
          >
            <div className={listItemContentStyle}>
              {isGroup && (
                <span className={chevronStyle({ expanded: !isCollapsed })}>
                  <LuChevronRight size={CHEVRON_SIZE} />
                </span>
              )}
              {item.icon && (
                <span
                  className={listItemIconStyle}
                  style={{ color: item.iconColor ?? LIST_ITEM_ICON_COLOR }}
                >
                  <item.icon size={LIST_ITEM_ICON_SIZE} />
                </span>
              )}
              <div className={listItemNameStyle}>
                {renderItem(item, isSelected)}
              </div>
            </div>
            {!isGroup && RenderRowMenu && <RenderRowMenu item={item} />}
          </div>
        );
      })}
      {items.length === 0 && (
        <div className={emptyMessageStyle}>{emptyMessage}</div>
      )}
    </div>
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
    fitContent,
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
    fitContent,
  };
}
