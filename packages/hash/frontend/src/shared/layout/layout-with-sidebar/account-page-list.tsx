import {
  FunctionComponent,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  MutableRefObject,
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
  DropAnimation,
  MeasuringStrategy,
  DragMoveEvent,
  DragOverEvent,
  DragEndEvent,
  DragStartEvent,
  defaultDropAnimation,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import { groupBy, isEqual } from "lodash";
import {
  AccountPage,
  useAccountPages,
} from "../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../components/hooks/useCreatePage";
import { NavLink } from "./nav-link";
import { AccountPageListItem } from "./account-page-list-item";
import { getProjection } from "./sortable-tree/utilities";
import { LoadingSpinner } from "@hashintel/hash-design-system/loading-spinner";
import Box from "@mui/material/Box";

type AccountPageListProps = {
  accountId: string;
  currentPageEntityId?: string;
};

type TreeElement = {
  entityId: string;
  parentPageEntityId: string;
  parentId: string;
  title: string;
  depth: number;
  index: number;
  expanded: boolean;
  expandable: boolean;
};

export type SensorContext = MutableRefObject<{
  items: TreeElement[];
  offset: number;
}>;

const dropAnimationConfig: DropAnimation = {
  keyframes({ transform }) {
    return [
      { opacity: 1, transform: CSS.Transform.toString(transform.initial) },
      {
        opacity: 0,
        transform: CSS.Transform.toString({
          ...transform.final,
          x: transform.final.x + 5,
          y: transform.final.y + 5,
        }),
      },
    ];
  },
  easing: "ease-out",
  sideEffects({ active }) {
    active.node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: defaultDropAnimation.duration,
      easing: defaultDropAnimation.easing,
    });
  },
};

const measuringConfig = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

const recursiveOrder = (
  groupedPages: { [id: string]: AccountPage[] },
  id: string,
  expandedIds: string[],
  depth = 0,
): TreeElement[] => {
  const emptyList: TreeElement[] = [];
  return (
    groupedPages[id]?.reduce((prev, page, index) => {
      const children = recursiveOrder(
        groupedPages,
        page.entityId,
        expandedIds,
        depth + 1,
      );
      const expanded = expandedIds.includes(page.entityId);
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
          },
          ...(expanded ? children : []),
        ],
      ];
    }, emptyList) || emptyList
  );
};

const orderItems = (pages: AccountPage[], expandedIds: string[]) =>
  recursiveOrder(
    groupBy(pages, (page) => page.parentPageEntityId),
    "null",
    expandedIds,
    0,
  );

export const AccountPageList: FunctionComponent<AccountPageListProps> = ({
  currentPageEntityId,
  accountId,
}) => {
  const { data } = useAccountPages(accountId);
  const [loading, setLoading] = useState(false);
  const [expandedPageIds, setExpandedPageIds] = useLocalstorageState<string[]>(
    "hash-expanded-sidebar-pages",
    [],
  );
  const [items, setItems] = useState<TreeElement[]>(() => []);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const { createUntitledPage, reorderPage } = useCreatePage(accountId);

  // @todo handle loading/error states properly
  const addPage = useCallback(async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      await createUntitledPage();
    } catch (err) {
      // eslint-disable-next-line no-console -- TODO: consider using logger
      console.error("Could not create page: ", err);
    } finally {
      setLoading(false);
    }
  }, [createUntitledPage, loading]);

  const handleToggle = (nodeId: string) => {
    setExpandedPageIds((expandedIds) =>
      expandedIds.includes(nodeId)
        ? expandedIds.filter((id) => id !== nodeId)
        : [...expandedIds, nodeId],
    );
  };

  useMemo(() => {
    setItems(orderItems(data, expandedPageIds));
  }, [data, expandedPageIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const sensorContext: SensorContext = useRef({
    items,
    offset: offsetLeft,
  });

  useEffect(() => {
    sensorContext.current = {
      items,
      offset: offsetLeft,
    };
  }, [items, offsetLeft]);

  const projected =
    activeId && overId
      ? getProjection(items, activeId, overId, offsetLeft, 16)
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
      setItems(
        orderItems(
          data,
          expandedPageIds.filter((id) => id !== activeItemId),
        ),
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

      const clonedItems = [...items] as TreeElement[];

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
          expanded: false,
          expandable: true,
        };

        const sortedItems = arrayMove(clonedItems, activeIndex, overIndex);

        const newIndex = sortedItems
          .filter((item) => item.parentPageEntityId === parentPageEntityId)
          .findIndex((item) => item.entityId === activeId);

        const newItems = orderItems(sortedItems, expandedPageIds);

        // if (!isEqual(newItems, items)) {
        setLoading(true);
        setItems(sortedItems);

        reorderPage(active.id as string, parentPageEntityId, newIndex).then(
          () => {
            setLoading(false);
          },
          (err) => {
            setItems(orderItems(data, expandedPageIds));
            setLoading(false);
          },
        );
      }
    }
  };

  const handleDragCancel = () => {
    resetState();
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
      // modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
    >
      <SortableContext
        items={items.map((x) => x.entityId)}
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
            {items.map(({ entityId, title, depth, expandable, expanded }) => (
              <AccountPageListItem
                key={entityId}
                title={title}
                id={entityId}
                url={`/${accountId}/${entityId}`}
                depth={
                  entityId === activeId && projected ? projected.depth : depth
                }
                onCollapse={
                  expandable ? () => handleToggle(entityId) : undefined
                }
                selected={currentPageEntityId === entityId}
                expandable={expandable}
                expanded={expanded}
                disabled={loading}
              />
            ))}

            <DragOverlay dropAnimation={dropAnimationConfig} />
          </Box>
        </NavLink>
      </SortableContext>
    </DndContext>
  );
};
