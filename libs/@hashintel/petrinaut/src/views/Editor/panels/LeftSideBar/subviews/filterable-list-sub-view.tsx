import { css, cva } from "@hashintel/ds-helpers/css";
import type { ReactNode } from "react";
import { use } from "react";
import { TbFilter } from "react-icons/tb";

import { IconButton } from "../../../../../components/icon-button";
import type {
  SubView,
  SubViewResizeConfig,
} from "../../../../../components/sub-view/types";
import { EditorContext } from "../../../../../state/editor-context";
import type { SelectionItem } from "../../../../../state/selection";

export const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
});

export const listItemRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    padding: "[4px 2px 4px 8px]",
    borderRadius: "sm",
    cursor: "pointer",
    fontSize: "[13px]",
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "[rgba(59, 130, 246, 0.15)]",
        _hover: {
          backgroundColor: "[rgba(59, 130, 246, 0.2)]",
        },
      },
      false: {
        backgroundColor: "[transparent]",
        _hover: {
          backgroundColor: "[rgba(0, 0, 0, 0.05)]",
        },
      },
    },
  },
});

export const listItemNameStyle = css({
  flex: "[1]",
  fontSize: "[13px]",
  color: "[#374151]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const emptyMessageStyle = css({
  fontSize: "[13px]",
  color: "[#9ca3af]",
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
  emptyMessage: string;
  renderHeaderAction?: () => ReactNode;
}

const FilterHeaderAction: React.FC<{
  renderExtraAction?: () => ReactNode;
}> = ({ renderExtraAction }) => (
  <>
    {renderExtraAction?.()}
    <IconButton aria-label="Filter list" size="xs">
      <TbFilter />
    </IconButton>
  </>
);

function FilterableListContent<T extends FilterableListItem>({
  useItems,
  getSelectionItem,
  renderItem,
  emptyMessage,
}: {
  useItems: () => T[];
  getSelectionItem: (item: T) => SelectionItem;
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  emptyMessage: string;
}) {
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
              if (
                event.target instanceof HTMLElement &&
                (event.target.closest("button[aria-label^='Delete']") ||
                  event.target.closest("input"))
              ) {
                return;
              }
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
          </div>
        );
      })}
      {items.length === 0 && (
        <div className={emptyMessageStyle}>{emptyMessage}</div>
      )}
    </div>
  );
}

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
    emptyMessage,
    renderHeaderAction: renderExtraAction,
  } = config;

  const Component: React.FC = () => (
    <FilterableListContent
      useItems={useItems}
      getSelectionItem={getSelectionItem}
      renderItem={renderItem}
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
