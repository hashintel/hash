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
  children?: TreeElement[];
}

const getRecursivePageList = (
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
      const children = getRecursivePageList(
        groupedPages,
        page.entityId,
        expandedIds,
        depth + 1,
        collapsed || !expanded,
      );
      const expandable = !!children.length;

      const item = {
        ...page,
        depth,
        index,
        parentId: page.parentPageEntityId,
        expanded,
        expandable,
        collapsed,
      } as TreeElement;

      return [...prev, item, ...children];
    }, emptyList) || emptyList
  );
};

export const getPageList = (pages: AccountPage[], expandedIds: string[]) =>
  getRecursivePageList(
    groupBy(pages, (page) => page.parentPageEntityId),
    "null",
    expandedIds,
  );

// Calculates relevant properties for the page that is being dragged
// - depth: current drag depth
// - minDepth: minimum possible depth the page can be dragged to
// - maxDepth: maximum possible depth the page can be dragged to
// - parentPageEntityId: entityId of the parent page it's being dragged to, or null
export const getProjection = (
  items: TreeElement[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragDepth: number,
) => {
  const expandedPages = items.filter((item) => !item.collapsed);
  const overItemIndex = expandedPages.findIndex(
    ({ entityId }) => entityId === overId,
  );
  const activeItemIndex = expandedPages.findIndex(
    ({ entityId }) => entityId === activeId,
  );

  const activeItem = expandedPages[activeItemIndex];
  const newItems = arrayMove(expandedPages, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

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
