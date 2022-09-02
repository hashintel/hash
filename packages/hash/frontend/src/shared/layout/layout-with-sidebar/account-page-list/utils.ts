import { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { AccountPage } from "../../../../components/hooks/useAccountPages";

export interface TreeElement extends AccountPage {
  depth: number;
}

export const getPageList = (
  pagesList: AccountPage[],
  parentId: string | null = null,
  depth = 0,
): TreeElement[] => {
  const emptyList: TreeElement[] = [];

  return pagesList
    .filter((page) => page.parentPageEntityId === parentId)
    .reduce((prev, page) => {
      const children = getPageList(pagesList, page.entityId, depth + 1);

      const item = {
        ...page,
        depth,
      } as TreeElement;

      return [...prev, item, ...children];
    }, emptyList);
};

export const isPageCollapsed = (
  page: TreeElement,
  pageList: TreeElement[],
  expandedIds: string[],
  activeId: UniqueIdentifier | null,
): boolean => {
  const { parentPageEntityId } = page;

  if (!parentPageEntityId) {
    return false;
  }

  const parentPage = pageList.find(
    (item) => item.entityId === page.parentPageEntityId,
  );

  const parentExpanded =
    parentPageEntityId !== activeId && expandedIds.includes(parentPageEntityId);

  return (
    !parentExpanded ||
    (!!parentPage &&
      isPageCollapsed(parentPage, pageList, expandedIds, activeId))
  );
};

// Calculates relevant properties for the page that is being dragged
// - depth: current drag depth
// - minDepth: minimum possible depth the page can be dragged to
// - maxDepth: maximum possible depth the page can be dragged to
// - parentPageEntityId: entityId of the parent page it's being dragged to, or null
export const getProjection = (
  pages: TreeElement[],
  collapsedPageIds: string[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragDepth: number,
) => {
  const expandedPages = pages.filter(
    (page) => !collapsedPageIds.includes(page.entityId),
  );

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
