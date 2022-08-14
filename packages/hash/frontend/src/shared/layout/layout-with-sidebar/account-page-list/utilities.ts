import { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { groupBy } from "lodash";
import { AccountPage } from "../../../../components/hooks/useAccountPages";

export interface TreeElement extends AccountPage {
  parentId: string;
  depth: number;
  index: number;
  expanded: boolean;
  expandable: boolean;
  collapsed: boolean;
}

const recursiveOrder = (
  groupedPages: { [id: string]: AccountPage[] },
  id: string,
  expandedIds: string[],
  depth = 0,
  collapsed = false,
): TreeElement[] => {
  const emptyList: TreeElement[] = [];
  return (
    groupedPages[id]?.reduce((prev, page, index) => {
      const expanded = expandedIds.includes(page.entityId);
      const children = recursiveOrder(
        groupedPages,
        page.entityId,
        expandedIds,
        depth + 1,
        collapsed || !expanded,
      );
      const expandable = !!children.length;

      return [
        ...prev,
        ...[
          {
            ...page,
            depth,
            index,
            parentId: page.parentPageEntityId,
            expanded,
            expandable,
            collapsed,
          } as TreeElement,
          ...children,
        ],
      ];
    }, emptyList) || emptyList
  );
};

export const orderItems = (pages: AccountPage[], expandedIds: string[]) =>
  recursiveOrder(
    groupBy(pages, (page) => page.parentPageEntityId),
    "null",
    expandedIds,
    0,
  );

export const getProjection = (
  items: TreeElement[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragOffset: number,
  indentationWidth: number,
) => {
  const overItemIndex = items.findIndex(({ entityId }) => entityId === overId);
  const activeItemIndex = items.findIndex(
    ({ entityId }) => entityId === activeId,
  );

  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems.filter((item) => !item.collapsed)[
    overItemIndex + 1
  ];

  const dragDepth = Math.round(dragOffset / indentationWidth);
  const projectedDepth = (activeItem ? activeItem.depth : 0) + dragDepth;
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth);

  const getParentId = () => {
    if (depth === 0 || !previousItem) {
      return null;
    }

    if (depth === previousItem.depth) {
      return previousItem.parentPageEntityId;
    }

    if (depth > previousItem.depth) {
      return previousItem.entityId;
    }

    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.parentPageEntityId;

    return newParent ?? null;
  };

  return { depth, maxDepth, minDepth, parentPageEntityId: getParentId() };
};
