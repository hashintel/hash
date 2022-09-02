import { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { AccountPage } from "../../../../components/hooks/useAccountPages";

export interface TreeItem {
  page: AccountPage;
  depth: number;
}

export const getTreeItemList = (
  pagesList: AccountPage[],
  parentId: string | null = null,
  depth = 0,
): TreeItem[] => {
  const emptyList: TreeItem[] = [];

  return pagesList
    .filter((page) => page.parentPageEntityId === parentId)
    .reduce((prev, page) => {
      const children = getTreeItemList(pagesList, page.entityId, depth + 1);

      const item = {
        page,
        depth,
      } as TreeItem;

      return [...prev, item, ...children];
    }, emptyList);
};

export const isPageCollapsed = (
  treeItem: TreeItem,
  treeItemList: TreeItem[],
  expandedIds: string[],
  activeId: UniqueIdentifier | null,
): boolean => {
  const { parentPageEntityId } = treeItem.page;

  if (!parentPageEntityId) {
    return false;
  }

  const parentPage = treeItemList.find(
    ({ page }) => page.entityId === parentPageEntityId,
  );

  const parentExpanded =
    parentPageEntityId !== activeId && expandedIds.includes(parentPageEntityId);

  return (
    !parentExpanded ||
    (!!parentPage &&
      isPageCollapsed(parentPage, treeItemList, expandedIds, activeId))
  );
};

// Calculates relevant properties for the page that is being dragged
// - depth: current drag depth
// - minDepth: minimum possible depth the page can be dragged to
// - maxDepth: maximum possible depth the page can be dragged to
// - parentPageEntityId: entityId of the parent page it's being dragged to, or null
export const getProjection = (
  pages: TreeItem[],
  collapsedPageIds: string[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragDepth: number,
) => {
  const expandedPages = pages.filter(
    ({ page }) => !collapsedPageIds.includes(page.entityId),
  );

  const overItemIndex = expandedPages.findIndex(
    ({ page }) => page.entityId === overId,
  );
  const activeItemIndex = expandedPages.findIndex(
    ({ page }) => page.entityId === activeId,
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
      return previousItem.page.parentPageEntityId;
    }

    if (depth > previousItem.depth) {
      return previousItem.page.entityId;
    }

    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.page.parentPageEntityId;

    return newParent ?? null;
  };

  return { depth, maxDepth, minDepth, parentPageEntityId: getParentId() };
};
