import { css, cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
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

export const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
});

export const listItemRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    minHeight: "8",
    pl: "2",
    pr: "1",
    py: "1",
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

export const listItemContentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "[1]",
  minWidth: "[0]",
});

export const listItemNameStyle = css({
  flex: "[1]",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s105",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const emptyMessageStyle = css({
  fontSize: "sm",
  color: "neutral.s85",
});

interface FilterableListItem {
  id: string;
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
  } = use(EditorContext);

  return (
    <div className={listContainerStyle}>
      {items.map((item) => {
        const isSelected = checkIsSelected(item.id);
        const selectionItem = getSelectionItem(item);

        return (
          <div
            key={item.id}
            onClick={(event) => {
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
            {renderItem(item, isSelected)}
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
