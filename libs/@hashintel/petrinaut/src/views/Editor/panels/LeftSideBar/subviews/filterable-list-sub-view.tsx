import { css, cva } from "@hashintel/ds-helpers/css";
import type { ComponentType, ReactNode } from "react";
import { use } from "react";
import { LuArrowDownWideNarrow, LuListFilter, LuSearch } from "react-icons/lu";
import { TbDots } from "react-icons/tb";

import { IconButton } from "../../../../../components/icon-button";
import type { MenuItem } from "../../../../../components/menu";
import { Menu } from "../../../../../components/menu";
import type {
  SubView,
  SubViewResizeConfig,
} from "../../../../../components/sub-view/types";
import { EditorContext } from "../../../../../state/editor-context";
import type { SelectionItem } from "../../../../../state/selection";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  flex: "[1]",
  /** Reduce horizontal padding from the parent */
  mx: "-1",
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
  /** Return menu items for the row's ellipsis menu. When omitted, no menu is shown. */
  getMenuItems?: (item: T) => MenuItem[];
  emptyMessage: string;
  renderHeaderAction?: () => ReactNode;
}

const FilterHeaderAction: React.FC<{
  renderExtraAction?: () => ReactNode;
}> = ({ renderExtraAction }) => (
  <>
    <IconButton aria-label="Filter list" size="xs">
      <LuListFilter />
    </IconButton>
    <IconButton aria-label="Sort list" size="xs">
      <LuArrowDownWideNarrow />
    </IconButton>
    <IconButton aria-label="Search list" size="xs">
      <LuSearch />
    </IconButton>
    {renderExtraAction?.()}
  </>
);

/**
 * Renders the row ellipsis menu. Separated into its own component so that
 * `getMenuItems` (which may call hooks) is invoked as part of a component render.
 */
const RowMenu = <T extends FilterableListItem>({
  getMenuItems,
  item,
}: {
  getMenuItems: (item: T) => MenuItem[];
  item: T;
}) => {
  const menuItems = getMenuItems(item);
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
  getMenuItems,
  emptyMessage,
}: {
  useItems: () => T[];
  getSelectionItem: (item: T) => SelectionItem;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  getMenuItems?: (item: T) => MenuItem[];
  emptyMessage: string;
}) => {
  const items = useItems();
  const {
    isSelected: checkIsSelected,
    selectItem,
    toggleItem,
    clearSelection,
  } = use(EditorContext);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className={listContainerStyle} onClick={clearSelection}>
      {items.map((item) => {
        const isSelected = checkIsSelected(item.id);
        const selectionItem = getSelectionItem(item);

        return (
          <div
            key={item.id}
            onClick={(event) => {
              event.stopPropagation();
              if (event.metaKey || event.ctrlKey) {
                toggleItem(selectionItem);
              } else {
                selectItem(selectionItem);
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                selectItem(selectionItem);
              }
            }}
            className={listItemRowStyle({ isSelected })}
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
              <span className={listItemNameStyle}>
                {renderItem(item, isSelected)}
              </span>
            </div>
            {getMenuItems && (
              <RowMenu getMenuItems={getMenuItems} item={item} />
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
    getMenuItems,
    emptyMessage,
    renderHeaderAction: renderExtraAction,
  } = config;

  const Component: React.FC = () => (
    <FilterableListContent
      useItems={useItems}
      getSelectionItem={getSelectionItem}
      renderItem={renderItem}
      getMenuItems={getMenuItems}
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
