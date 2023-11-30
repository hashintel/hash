import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  MeasuringStrategy,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { IconButton } from "@hashintel/design-system";
import {
  EntityUuid,
  extractEntityUuidFromEntityId,
  isEntityId,
  OwnedById,
} from "@local/hash-subgraph";
import { Box, Collapse, Tooltip, Typography } from "@mui/material";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocalstorageState } from "rooks";

import { useAccountPages } from "../../../../components/hooks/use-account-pages";
import { useArchivePage } from "../../../../components/hooks/use-archive-page";
import { useCreatePage } from "../../../../components/hooks/use-create-page";
import { useCreateSubPage } from "../../../../components/hooks/use-create-sub-page";
import { useReorderPage } from "../../../../components/hooks/use-reorder-page";
import { useUserOrOrgShortnameByOwnedById } from "../../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import { constructPageRelativeUrl } from "../../../../lib/routes";
import { PlusRegularIcon } from "../../../icons/plus-regular";
import { NavLink } from "../nav-link";
import { ViewAllLink } from "../view-all-link";
import { AccountPageListItem } from "./account-page-list-item";
import { IDENTATION_WIDTH } from "./page-tree-item";
import { PagesLoadingState } from "./pages-loading-state";
import {
  getLastIndex,
  getProjection,
  getTreeItemList,
  isPageCollapsed,
  TreeItem,
} from "./utils";

type AccountPageListProps = {
  ownedById: OwnedById;
  currentPageEntityUuid?: EntityUuid;
};

const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

export const AccountPageList: FunctionComponent<AccountPageListProps> = ({
  currentPageEntityUuid,
  ownedById,
}) => {
  const { data, loading: pagesLoading } = useAccountPages(ownedById);

  const [expanded, setExpanded] = useState<boolean>(true);

  const { shortname: ownerShortname } = useUserOrOrgShortnameByOwnedById({
    ownedById,
  });

  const [createUntitledPage, { loading: createUntitledPageLoading }] =
    useCreatePage({ ownedById, shortname: ownerShortname });

  const [createSubPage, { loading: createSubpageLoading }] = useCreateSubPage({
    ownedById,
    shortname: ownerShortname,
  });
  const [reorderPage, { loading: reorderLoading }] = useReorderPage();
  const { archivePage, loading: archivePageLoading } = useArchivePage();

  const loading =
    pagesLoading ||
    createUntitledPageLoading ||
    createSubpageLoading ||
    reorderLoading ||
    archivePageLoading;

  const [expandedPageIds, setExpandedPageIds] = useLocalstorageState<string[]>(
    "hash-expanded-sidebar-pages",
    [],
  );

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const [treeItems, setTreeItems] = useState(() => getTreeItemList(data));

  const [prevData, setPrevData] = useState(data);

  if (data !== prevData) {
    setPrevData(data);
    setTreeItems(getTreeItemList(data));
  }

  // @todo handle loading/error states properly
  const addPage = useCallback(async () => {
    if (loading) {
      return;
    }

    try {
      await createUntitledPage(getLastIndex(treeItems), "document");
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Could not create page: ", err);
    }
  }, [createUntitledPage, loading, treeItems]);

  const handleToggle = (nodeId: string) => {
    setExpandedPageIds((expandedIds) =>
      expandedIds.includes(nodeId)
        ? expandedIds.filter((id) => id !== nodeId)
        : [...expandedIds, nodeId],
    );
  };

  const collapsedPageIds = useMemo(
    () =>
      treeItems
        .filter((item) =>
          isPageCollapsed(item, treeItems, expandedPageIds, activeId),
        )
        .map(({ page }) => page.metadata.recordId.entityId),
    [treeItems, expandedPageIds, activeId],
  );

  const pagesFlatIdList = useMemo(
    () => treeItems.map(({ page }) => page.metadata.recordId.entityId),
    [treeItems],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const dragDepth = useMemo(
    () => Math.round(offsetLeft / IDENTATION_WIDTH),
    [offsetLeft],
  );

  const projected =
    activeId && overId
      ? getProjection(treeItems, collapsedPageIds, activeId, overId, dragDepth)
      : null;

  useEffect(() => {
    if (activeId) {
      document.body.style.setProperty("cursor", "grabbing");

      return () => {
        if (document.body.style.cursor === "grabbing") {
          document.body.style.setProperty("cursor", "");
        }
      };
    }
  }, [activeId]);

  const resetState = () => {
    setOverId(null);
    setActiveId(null);
    setOffsetLeft(0);
  };

  const handleDragStart = ({
    active: { id: activeItemId },
  }: DragStartEvent) => {
    setActiveId(activeItemId);
    setOverId(activeItemId);
  };

  const handleDragMove = ({ delta }: DragMoveEvent) => {
    setOffsetLeft(delta.x);
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over?.id ?? null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    resetState();

    if (projected && over) {
      const { depth, parentPageEntityId } = projected;

      // The page that's being repositioned
      const activePage = treeItems.find(
        ({ page }) => page.metadata.recordId.entityId === active.id,
      );

      // The page that's being dragged "over"
      const overPage = treeItems.find(
        ({ page }) => page.metadata.recordId.entityId === over.id,
      );

      if (activePage && (activePage.depth !== depth || active.id !== over.id)) {
        const activePageIndex = treeItems.findIndex(
          ({ page }) => page.metadata.recordId.entityId === active.id,
        );

        const overPageIndex = treeItems.findIndex(
          ({ page }) => page.metadata.recordId.entityId === over.id,
        );

        const pagesWithParent = treeItems.filter(({ page }) =>
          parentPageEntityId
            ? page.parentPage?.metadata.recordId.entityId === parentPageEntityId
            : !page.parentPage,
        );

        // The new sibling pages of the active page (i.e. all other pages with the same parent)
        const siblingPages = pagesWithParent.filter(
          ({ page }) =>
            page.metadata.recordId.entityId !==
            activePage.page.metadata.recordId.entityId,
        );

        const overPageLocalIndex = pagesWithParent.findIndex(
          ({ page }) => page.metadata.recordId.entityId === over.id,
        );

        /**
         * If the over page is at a lower depth than the active page, we want to
         * insert the active page at the over page's index. Otherwise, we want to
         * insert it before the over page's index.
         */
        const newIndex =
          overPage && overPage.depth < activePage.depth
            ? overPageLocalIndex
            : overPageLocalIndex - 1;

        const beforeFractionalIndex =
          siblingPages[newIndex]?.page.fractionalIndex ?? null;

        const afterFractionalIndex =
          siblingPages[newIndex + 1]?.page.fractionalIndex ?? null;

        if (typeof active.id !== "string" || !isEntityId(active.id)) {
          throw new Error("Expected draggable element ID to be an `EntityId`");
        }

        /**
         * Manually construct the updated page tree so that the state can be
         * updated immediately, without waiting for the API response.
         */
        const clonedTreeItems = [...treeItems];

        const parentPage = treeItems.find(
          ({ page }) => page.metadata.recordId.entityId === parentPageEntityId,
        )?.page;

        clonedTreeItems[activePageIndex] = {
          page: { ...activePage.page, parentPage },
          depth,
        };

        const sortedTreeItems = arrayMove(
          clonedTreeItems,
          activePageIndex,
          overPageIndex,
        );

        setTreeItems(sortedTreeItems);

        reorderPage(
          active.id,
          parentPageEntityId,
          beforeFractionalIndex,
          afterFractionalIndex,
        ).catch(() => setTreeItems(getTreeItemList(data)));
      }
    }
  };

  const handleDragCancel = () => {
    resetState();
  };

  const renderPageTree = (
    treeItemList: TreeItem[],
    parentId: string | null = null,
  ) => {
    return treeItemList
      .filter(({ page: { parentPage } }) =>
        parentId
          ? parentPage?.metadata.recordId.entityId === parentId
          : !parentPage,
      )
      .map(({ page: { icon, metadata, title, type }, depth }) => {
        const { entityId } = metadata.recordId;

        const isPageExpanded =
          expandedPageIds.includes(entityId) && activeId !== entityId;
        const children = renderPageTree(treeItemList, entityId);

        const collapsed = collapsedPageIds.includes(entityId);

        const pageEntityUuid = extractEntityUuidFromEntityId(entityId);

        const item = (
          <AccountPageListItem
            key={entityId}
            title={title}
            pageEntityId={entityId}
            pageEntityTypeId={metadata.entityTypeId}
            icon={icon}
            pagePath={
              !ownerShortname
                ? ""
                : constructPageRelativeUrl({
                    workspaceShortname: ownerShortname,
                    pageEntityUuid,
                  })
            }
            depth={entityId === activeId && projected ? projected.depth : depth}
            onCollapse={() => handleToggle(entityId)}
            selected={
              currentPageEntityUuid === extractEntityUuidFromEntityId(entityId)
            }
            expanded={isPageExpanded}
            collapsed={collapsed}
            createSubPage={async () => {
              if (loading) {
                return;
              }

              await createSubPage(
                entityId,
                getLastIndex(treeItemList, entityId),
                type, // just make the subpage the same type as the parent (doc or canvas) for now
              );

              setExpandedPageIds((expandedIds) => {
                if (!expandedIds.includes(entityId)) {
                  return [...expandedIds, entityId];
                }

                return expandedIds;
              });
            }}
            archivePage={archivePage}
          />
        );

        return (
          <Box key={entityId}>
            {item}
            <Collapse key={`${entityId}-children`} in={isPageExpanded}>
              {children.length > 0 ? (
                children
              ) : (
                <Typography
                  variant="smallTextLabels"
                  sx={{
                    color: ({ palette }) => palette.gray[60],
                    paddingLeft: `${IDENTATION_WIDTH * depth + 28}px`,
                  }}
                >
                  No sub-pages inside
                </Typography>
              )}
            </Collapse>
          </Box>
        );
      });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      measuring={measuringConfig}
    >
      <SortableContext
        items={pagesFlatIdList}
        strategy={verticalListSortingStrategy}
      >
        <NavLink
          expanded={expanded}
          toggleExpanded={() => setExpanded((prev) => !prev)}
          title="Pages"
          loading={loading}
          endAdornment={
            <Tooltip title="Create new Page">
              <IconButton
                size="small"
                unpadded
                rounded
                className="end-adornment-button"
                onClick={addPage}
                sx={({ palette }) => ({
                  color: palette.gray[80],
                })}
              >
                <PlusRegularIcon />
              </IconButton>
            </Tooltip>
          }
        >
          {pagesLoading ? (
            <PagesLoadingState />
          ) : (
            <Box sx={{ marginX: 0.75 }} data-testid="pages-tree">
              {renderPageTree(treeItems)}

              <DragOverlay dropAnimation={null} />
            </Box>
          )}
          <Box marginLeft={1} marginTop={0.5}>
            <ViewAllLink href="/pages">View all pages</ViewAllLink>
          </Box>
        </NavLink>
      </SortableContext>
    </DndContext>
  );
};
