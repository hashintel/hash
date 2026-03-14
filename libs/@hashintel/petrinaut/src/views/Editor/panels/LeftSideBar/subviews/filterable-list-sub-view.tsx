import { css, cva } from "@hashintel/ds-helpers/css";
import type { ComponentType, ReactNode } from "react";
import { use, useEffect, useRef, useState } from "react";
import { LuSearch } from "react-icons/lu";
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

export const emptyMessageStyle = css({
  pt: "1",
  px: "1",
  fontSize: "sm",
  color: "neutral.s65",
});

interface FilterableListItem {
  id: string;
  icon?: ComponentType<{ size: number }>;
  iconColor?: string;
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
  /** Return menu items for the row's ellipsis menu. When omitted, no menu is shown.
   *  Named `useMenuItems` because implementations may call hooks. */
  useMenuItems?: (item: T) => MenuItem[];
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
 * Renders the row ellipsis menu. Separated into its own component so that
 * `useMenuItems` (which may call hooks) is invoked as part of a component render.
 */
const RowMenu = <T extends FilterableListItem>({
  useMenuItems,
  item,
}: {
  useMenuItems: (item: T) => MenuItem[];
  item: T;
}) => {
  const menuItems = useMenuItems(item);
  if (menuItems.length === 0) {
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
      items={menuItems}
      placement="bottom-end"
    />
  );
};

const FilterableListContent = <T extends FilterableListItem>({
  useItems,
  getSelectionItem,
  renderItem,
  useMenuItems,
  emptyMessage,
}: {
  useItems: () => T[];
  getSelectionItem: (item: T) => SelectionItem;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  useMenuItems?: (item: T) => MenuItem[];
  emptyMessage: string;
}) => {
  const items = useItems();
  const {
    isSelected: checkIsSelected,
    selectItem,
    toggleItem,
    clearSelection,
    setSelection,
  } = use(EditorContext);

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Clamp focus/anchor when items shrink
  useEffect(() => {
    if (items.length === 0) {
      setFocusedIndex(null);
      setAnchorIndex(null);
    } else {
      setFocusedIndex((prev) =>
        prev !== null ? Math.min(prev, items.length - 1) : prev,
      );
      setAnchorIndex((prev) =>
        prev !== null ? Math.min(prev, items.length - 1) : prev,
      );
    }
  }, [items.length]);

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
      const item = items[i];
      if (item) {
        const selItem = getSelectionItem(item);
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
    if (items.length === 0) {
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const nextIndex =
          focusedIndex === null
            ? 0
            : Math.min(focusedIndex + 1, items.length - 1);
        setFocusedIndex(nextIndex);
        if (event.shiftKey) {
          selectRange(anchorIndex ?? nextIndex, nextIndex);
        } else {
          const item = items[nextIndex];
          if (item) {
            selectItem(getSelectionItem(item));
          }
          setAnchorIndex(nextIndex);
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const nextIndex =
          focusedIndex === null
            ? items.length - 1
            : Math.max(focusedIndex - 1, 0);
        setFocusedIndex(nextIndex);
        if (event.shiftKey) {
          selectRange(anchorIndex ?? nextIndex, nextIndex);
        } else {
          const item = items[nextIndex];
          if (item) {
            selectItem(getSelectionItem(item));
          }
          setAnchorIndex(nextIndex);
        }
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (focusedIndex !== null) {
          const item = items[focusedIndex];
          if (item) {
            selectItem(getSelectionItem(item));
            setAnchorIndex(focusedIndex);
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
    selectionItem: SelectionItem,
  ) => {
    event.stopPropagation();
    setFocusedIndex(index);

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
      {items.map((item, index) => {
        const isSelected = checkIsSelected(item.id);
        const selectionItem = getSelectionItem(item);
        const isFocused = focusedIndex === index;

        return (
          <div
            key={item.id}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            onClick={(event) => handleRowClick(event, index, selectionItem)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectItem(selectionItem);
                setFocusedIndex(index);
                setAnchorIndex(index);
              }
            }}
            role="option"
            aria-selected={isSelected}
            className={listItemRowStyle({ isSelected, isFocused })}
          >
            <div className={listItemContentStyle}>
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
            {useMenuItems && (
              <RowMenu useMenuItems={useMenuItems} item={item} />
            )}
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
    useItems,
    getSelectionItem,
    renderItem,
    useMenuItems,
    emptyMessage,
    renderHeaderAction: renderExtraAction,
  } = config;

  const Component: React.FC = () => (
    <FilterableListContent
      useItems={useItems}
      getSelectionItem={getSelectionItem}
      renderItem={renderItem}
      useMenuItems={useMenuItems}
      emptyMessage={emptyMessage}
    />
  );

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
