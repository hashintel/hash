import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { EntityId } from "@local/hash-subgraph";

import type { SimplePage } from "../../../../components/hooks/use-account-pages";

export interface TreeItem {
  page: SimplePage;
  depth: number;
}

export const getTreeItemList = (
  pagesList: TreeItem["page"][],
  parentId: string | null = null,
  depth = 0,
): TreeItem[] => {
  const emptyList: TreeItem[] = [];

  return pagesList
    .filter(({ parentPage }) =>
      parentId
        ? parentPage?.metadata.recordId.entityId === parentId
        : !parentPage,
    )
    .sort((pageA, pageB) =>
      pageA.fractionalIndex > pageB.fractionalIndex ? 1 : -1,
    )
    .reduce((prev, page) => {
      const children = getTreeItemList(
        pagesList,
        page.metadata.recordId.entityId,
        depth + 1,
      );

      const item: TreeItem = {
        page,
        depth,
      };

      return [...prev, item, ...children];
    }, emptyList);
};

export const isPageCollapsed = (
  treeItem: TreeItem,
  treeItemList: TreeItem[],
  expandedIds: string[],
  activeId: UniqueIdentifier | null,
): boolean => {
  const parentPageEntityId =
    treeItem.page.parentPage?.metadata.recordId.entityId;

  if (!parentPageEntityId) {
    return false;
  }

  const parentPage = treeItemList.find(
    ({ page }) => page.metadata.recordId.entityId === parentPageEntityId,
  );

  const parentExpanded =
    parentPageEntityId !== activeId && expandedIds.includes(parentPageEntityId);

  return (
    !parentExpanded ||
    (!!parentPage &&
      isPageCollapsed(parentPage, treeItemList, expandedIds, activeId))
  );
};

export const getLastIndex = (
  treeItemList: TreeItem[],
  parentId: string | null = null,
) => {
  const groupItems = treeItemList.filter(({ page }) =>
    parentId
      ? page.parentPage?.metadata.recordId.entityId === parentId
      : !page.parentPage,
  );
  return groupItems[groupItems.length - 1]?.page.fractionalIndex ?? null;
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
    ({ page }) => !collapsedPageIds.includes(page.metadata.recordId.entityId),
  );

  const overItemIndex = expandedPages.findIndex(
    ({ page }) => page.metadata.recordId.entityId === overId,
  );
  const activeItemIndex = expandedPages.findIndex(
    ({ page }) => page.metadata.recordId.entityId === activeId,
  );

  const activeItem = expandedPages[activeItemIndex];
  const newItems = arrayMove(expandedPages, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  const projectedDepth = (activeItem ? activeItem.depth : 0) + dragDepth;
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth);

  const getParentId = (): EntityId | null => {
    if (depth === 0 || !previousItem) {
      return null;
    }

    if (depth === previousItem.depth) {
      return previousItem.page.parentPage?.metadata.recordId.entityId ?? null;
    }

    if (depth > previousItem.depth) {
      return previousItem.page.metadata.recordId.entityId;
    }

    const newParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth)?.page.parentPage?.metadata
      .recordId.entityId;

    return newParent ?? null;
  };

  return { depth, maxDepth, minDepth, parentPageEntityId: getParentId() };
};
