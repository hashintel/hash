import {
  FunctionComponent,
  SyntheticEvent,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  MutableRefObject,
} from "react";

import { treeFromParentReferences } from "@hashintel/hash-shared/util";
import { useRouter } from "next/router";
import { useLocalstorageState } from "rooks";
import {
  useSortable,
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
import {
  restrictToVerticalAxis,
  restrictToWindowEdges,
} from "@dnd-kit/modifiers";
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../components/hooks/useCreatePage";
import { NavLink } from "./nav-link";
import { AccountPageListItem } from "./account-page-list-item";
import { buildTree, flatten, getProjection } from "./sortable-tree/utilities";

type AccountPageListProps = {
  accountId: string;
  currentPageEntityId?: string;
};

type TreeElement = {
  entityId: string;
  parentPageEntityId: string;
  title: string;
  children?: TreeElement[];
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

export const AccountPageList: FunctionComponent<AccountPageListProps> = ({
  currentPageEntityId,
  accountId,
}) => {
  const { data } = useAccountPages(accountId);
  // console.log(data);
  // console.log(data.sort((a, b) => a.index.localeCompare(b.index)));
  // console.log(data.map((page) => page.index));
  // console.log(data.map((page) => page.index).sort());
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useLocalstorageState<string[]>(
    "hash-expanded-sidebar-pages",
    [],
  );
  const [items, setItems] = useState(() => data);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<{
    parentId: UniqueIdentifier | null;
    overId: UniqueIdentifier;
  } | null>(null);

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

  const formattedData = useMemo(
    () =>
      treeFromParentReferences(
        data as TreeElement[],
        "entityId",
        "parentPageEntityId",
        "children",
      ),
    [data],
  );

  const handleSelect = (_: SyntheticEvent, pageEntityId: string) => {
    console.log("handleSelect");
    void router.push(`/${accountId}/${pageEntityId}`);
  };

  const handleToggle = (nodeId: string) => {
    console.log("handleToggle");
    setExpanded((expandedIds) =>
      expandedIds.includes(nodeId)
        ? expandedIds.filter((id) => id !== nodeId)
        : [...expandedIds, nodeId],
    );
  };

  const sensors = useSensors(useSensor(PointerSensor));
  // const flattenedItems = formattedData;
  const flattenedItems = flatten(formattedData, expanded);
  // console.log(flattenedItems);

  const sensorContext: SensorContext = useRef({
    items: flattenedItems,
    offset: offsetLeft,
  });

  useEffect(() => {
    sensorContext.current = {
      items: flattenedItems,
      offset: offsetLeft,
    };
  }, [flattenedItems, offsetLeft]);

  const projected =
    activeId && overId
      ? getProjection(flattenedItems, activeId, overId, offsetLeft, 16)
      : null;

  // console.log(items);

  const resetState = () => {
    setOverId(null);
    setActiveId(null);
    setOffsetLeft(0);
    setCurrentPosition(null);

    document.body.style.setProperty("cursor", "");
  };

  const handleDragStart = ({ active: { id: activeId } }: DragStartEvent) => {
    setActiveId(activeId);
    setOverId(activeId);

    const activeItem = flattenedItems.find(
      ({ entityId }) => entityId === activeId,
    );

    if (activeItem) {
      setCurrentPosition({
        parentId: activeItem.parentId,
        overId: activeId,
      });
    }

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

    // console.log(flattenedItems);
    // console.log(active);
    // console.log(over);
    // // console.log(projected.parentId);

    // // console.log(projected.depth);

    // const { depth, parentId } = projected;

    // const depthItems = flattenedItems.filter((item) => item.depth === depth);

    // console.log(depthItems);

    // const index =
    //   parentId === over.id
    //     ? 0
    //     : depthItems.findIndex((item) => item.entityId === over.id);
    // console.log(index);

    // const beforeId = parentId === over.id ? null : over?.id
    // const afterId = depthItems.find

    if (projected && over) {
      const { depth, parentId } = projected;
      const clonedItems = JSON.parse(JSON.stringify(flattenedItems));
      const overIndex = clonedItems.findIndex(
        ({ entityId }) => entityId === over.id,
      );
      const activeIndex = clonedItems.findIndex(
        ({ entityId }) => entityId === active.id,
      );
      const activeTreeItem = clonedItems[activeIndex];

      clonedItems[activeIndex] = { ...activeTreeItem, depth, parentId };

      const sortedItems = arrayMove(clonedItems, activeIndex, overIndex);

      const newIndex = sortedItems
        .filter((items) => items.parentId === parentId)
        .findIndex((items) => items.entityId === activeId);

      console.log(newIndex);
      await reorderPage(active.id, parentId, newIndex);
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
        // items={formattedData.map((node) => node.entityId)}
        items={flattenedItems.map((x) => x.entityId)}
        strategy={verticalListSortingStrategy}
      >
        <NavLink
          title="Pages"
          endAdornmentProps={{
            tooltipTitle: "Create new Page",
            onClick: addPage,
            "data-testid": "create-page-btn",
          }}
        >
          {flattenedItems.map((node) => (
            <AccountPageListItem
              key={node.entityId}
              node={node}
              accountId={accountId}
              depth={
                node.entityId === activeId && projected
                  ? projected.depth
                  : node.depth
              }
              onCollapse={
                node.children?.length
                  ? () => handleToggle(node.entityId)
                  : undefined
              }
              selected={currentPageEntityId === node.entityId}
              expandable={!!node.children?.length}
              expanded={expanded.includes(node.entityId)}
            />
          ))}

          <DragOverlay dropAnimation={dropAnimationConfig} />
        </NavLink>
      </SortableContext>
    </DndContext>
  );
};
