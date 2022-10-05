import {
  FunctionComponent,
  useMemo,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useLocalstorageState } from "rooks";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  UniqueIdentifier,
  MeasuringStrategy,
  DragMoveEvent,
  DragOverEvent,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import { useAccountPages } from "../../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../../components/hooks/useCreatePage";
import { useCreateSubPage } from "../../../../components/hooks/useCreateSubPage";
import { useArchivePage } from "../../../../components/hooks/useArchivePage";
import { NavLink } from "../nav-link";
import { AccountPageListItem } from "./account-page-list-item";
import { useReorderPage } from "../../../../components/hooks/useReorderPage";
import {
  getProjection,
  getTreeItemList,
  isPageCollapsed,
  getLastIndex,
  TreeItem,
} from "./utils";
import { IDENTATION_WIDTH } from "./page-tree-item";
import { PagesLoadingState } from "./pages-loading-state";

type AccountPageListProps = {
  accountId: string;
  currentPageEntityId?: string;
};

const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

export const AccountPageList: FunctionComponent<AccountPageListProps> = ({
  currentPageEntityId,
  accountId,
}) => {
  const { data, loading: pagesLoading } = useAccountPages(accountId);

  const [createUntitledPage, { loading: createUntitledPageLoading }] =
    useCreatePage(accountId);
  const [createSubPage, { loading: createSubpageLoading }] =
    useCreateSubPage(accountId);
  const [reorderPage, { loading: reorderLoading }] = useReorderPage();
  const [archivePage, { loading: archivePageLoading }] = useArchivePage();

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
      await createUntitledPage(getLastIndex(treeItems));
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
        .map(({ page }) => page.entityId),
    [treeItems, expandedPageIds, activeId],
  );

  const pagesFlatIdList = useMemo(
    () => treeItems.map(({ page }) => page.entityId),
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

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    resetState();

    if (projected && over) {
      const { depth, parentPageEntityId } = projected;

      const clonedItems = [...treeItems];

      const overIndex = clonedItems.findIndex(
        ({ page }) => page.entityId === over.id,
      );
      const activeIndex = clonedItems.findIndex(
        ({ page }) => page.entityId === active.id,
      );
      const activeTreeItem = clonedItems[activeIndex];

      if (
        activeTreeItem &&
        (activeTreeItem.depth !== depth || active.id !== over.id)
      ) {
        clonedItems[activeIndex] = {
          page: {
            ...activeTreeItem.page,
            parentPageEntityId,
          },
          depth,
        };

        const sortedItems = arrayMove(clonedItems, activeIndex, overIndex);

        const parentSortedItems = sortedItems.filter(
          ({ page }) => page.parentPageEntityId === parentPageEntityId,
        );

        const newIndex = parentSortedItems.findIndex(
          ({ page }) => page.entityId === activeId,
        );

        const beforeIndex = parentSortedItems[newIndex - 1]?.page.index ?? null;
        const afterIndex = parentSortedItems[newIndex + 1]?.page.index ?? null;

        setTreeItems(sortedItems);
        reorderPage(
          active.id.toString(),
          parentPageEntityId,
          beforeIndex,
          afterIndex,
        ).catch(() => {
          setTreeItems(getTreeItemList(data));
        });
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
      .filter(({ page }) => page.parentPageEntityId === parentId)
      .map(({ page: { entityId, title }, depth }) => {
        const expanded =
          expandedPageIds.includes(entityId) && activeId !== entityId;
        const children = renderPageTree(treeItemList, entityId);
        const expandable = !!children.length;
        const collapsed = collapsedPageIds.includes(entityId);

        const item = (
          <AccountPageListItem
            key={entityId}
            title={title}
            id={entityId}
            url={`/${accountId}/${entityId}`}
            depth={entityId === activeId && projected ? projected.depth : depth}
            onCollapse={expandable ? () => handleToggle(entityId) : undefined}
            selected={currentPageEntityId === entityId}
            expandable={expandable}
            expanded={expanded}
            collapsed={collapsed}
            createSubPage={async () => {
              if (loading) {
                return;
              }

              await createSubPage(
                entityId,
                getLastIndex(treeItemList, entityId),
              );
            }}
            archivePage={archivePage}
          />
        );

        return (
          <Box key={entityId}>
            {item}
            {expandable ? (
              <Collapse key={`${entityId}-children`} in={expanded}>
                {children}
              </Collapse>
            ) : null}
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
          title="Pages"
          endAdornmentProps={{
            tooltipTitle: "Create new Page",
            onClick: addPage,
            "data-testid": "create-page-btn",
            loading,
          }}
        >
          {pagesLoading ? (
            <PagesLoadingState />
          ) : (
            <Box sx={{ marginX: 0.75 }} data-testid="pages-tree">
              {renderPageTree(treeItems)}

              <DragOverlay dropAnimation={null} />
            </Box>
          )}
        </NavLink>
      </SortableContext>
    </DndContext>
  );
};
