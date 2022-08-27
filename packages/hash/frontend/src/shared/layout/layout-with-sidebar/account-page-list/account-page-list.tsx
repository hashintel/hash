import { FunctionComponent, useMemo, useState, useCallback } from "react";
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
import {
  AccountPage,
  useAccountPages,
} from "../../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../../components/hooks/useCreatePage";
import { useCreateSubPage } from "../../../../components/hooks/useCreateSubPage";
import { useArchivePage } from "../../../../components/hooks/useArchivePage";
import { NavLink } from "../nav-link";
import { AccountPageListItem } from "./account-page-list-item";
import { useReorderPage } from "../../../../components/hooks/useReorderPage";
import { TreeElement, getProjection, getPageList } from "./utils";

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
  const { data } = useAccountPages(accountId);

  const { createUntitledPage, loading: createUntitledPageLoading } =
    useCreatePage(accountId);
  const { createSubPage, loading: createSubpageLoading } =
    useCreateSubPage(accountId);
  const { reorderPage, loading: reorderLoading } = useReorderPage(accountId);
  const { archivePage, loading: archivePageLoading } = useArchivePage();

  const [expandedPageIds, setExpandedPageIds] = useLocalstorageState<string[]>(
    "hash-expanded-sidebar-pages",
    [],
  );

  const [pagesTreeList, setPagesTreeList] = useState<TreeElement[]>([]);
  const [pagesFlatList, setPagesFlatList] = useState<TreeElement[]>([]);
  const [pagesFlatIdList, setPagesFlatIdList] = useState<string[]>([]);

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const loading =
    createUntitledPageLoading ||
    createSubpageLoading ||
    reorderLoading ||
    archivePageLoading;

  // @todo handle loading/error states properly
  const addPage = useCallback(async () => {
    if (loading) {
      return;
    }

    try {
      await createUntitledPage();
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Could not create page: ", err);
    }
  }, [createUntitledPage, loading]);

  const handleToggle = (nodeId: string) => {
    setExpandedPageIds((expandedIds) =>
      expandedIds.includes(nodeId)
        ? expandedIds.filter((id) => id !== nodeId)
        : [...expandedIds, nodeId],
    );
  };

  const setSortableList = (
    list: AccountPage[],
    expandedPageIdList: string[],
  ) => {
    const { treeList, flatList } = getPageList(list, expandedPageIdList);
    setPagesTreeList(treeList);
    setPagesFlatList(flatList);
    setPagesFlatIdList(flatList.map((page) => page.entityId));
  };

  useMemo(() => {
    if (!loading) {
      setSortableList(data, expandedPageIds);
    }
  }, [data, expandedPageIds, loading]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const projected =
    activeId && overId
      ? getProjection(pagesFlatList, activeId, overId, offsetLeft, 16)
      : null;

  const resetState = () => {
    setOverId(null);
    setActiveId(null);
    setOffsetLeft(0);
    document.body.style.setProperty("cursor", "");
  };

  const handleDragStart = ({
    active: { id: activeItemId },
  }: DragStartEvent) => {
    if (expandedPageIds.findIndex((id) => id === activeItemId) > -1) {
      setSortableList(
        data,
        expandedPageIds.filter((id) => id !== activeItemId),
      );
    }
    setActiveId(activeItemId);
    setOverId(activeItemId);

    document.body.style.setProperty("cursor", "grabbing");
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

      const clonedItems = [...pagesFlatList] as TreeElement[];

      const overIndex = clonedItems.findIndex(
        ({ entityId }) => entityId === over.id,
      );
      const activeIndex = clonedItems.findIndex(
        ({ entityId }) => entityId === active.id,
      );
      const activeTreeItem = clonedItems[activeIndex];

      if (
        activeTreeItem &&
        (activeTreeItem?.depth !== depth || active.id !== over.id)
      ) {
        clonedItems[activeIndex] = {
          ...activeTreeItem,
          depth,
          parentPageEntityId,
        };

        const sortedItems = arrayMove(clonedItems, activeIndex, overIndex);

        const newIndex = sortedItems
          .filter((item) => item.parentPageEntityId === parentPageEntityId)
          .findIndex((item) => item.entityId === activeId);

        setSortableList(sortedItems, expandedPageIds);
        reorderPage(active.id.toString(), parentPageEntityId, newIndex).catch(
          () => {
            // fallback to previous state when the request fails
            setSortableList(data, expandedPageIds);
          },
        );
      } else {
        setSortableList(data, expandedPageIds);
      }
    }
  };

  const handleDragCancel = () => {
    resetState();
  };

  const renderPageTree = (itemsArray: TreeElement[]) => {
    return itemsArray.map(
      ({
        entityId,
        title,
        depth,
        expandable,
        expanded,
        collapsed,
        children,
      }) => {
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
            createSubPage={createSubPage}
            archivePage={archivePage}
          />
        );

        return (
          <Box key={entityId}>
            {item}
            {children ? (
              <Collapse key={`${entityId}-children`} in={expanded}>
                {renderPageTree(children)}
              </Collapse>
            ) : null}
          </Box>
        );
      },
    );
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
          <Box sx={{ marginX: 0.75 }}>
            {renderPageTree(pagesTreeList)}

            <DragOverlay dropAnimation={null} />
          </Box>
        </NavLink>
      </SortableContext>
    </DndContext>
  );
};
