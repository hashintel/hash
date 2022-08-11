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
import { TreeView } from "@mui/lab";
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
import { PageTreeItem } from "./account-page-list/page-tree-item";
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

  const { createUntitledPage } = useCreatePage(accountId);

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
    void router.push(`/${accountId}/${pageEntityId}`);
  };

  const handleToggle = (_: SyntheticEvent, nodeIds: string[]) => {
    setExpanded(nodeIds);
  };

  const sensors = useSensors(useSensor(PointerSensor));
  // const flattenedItems = formattedData;
  const flattenedItems = flatten(formattedData);

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

  console.log(projected);

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
    console.log(delta);
    setOffsetLeft(delta.x);
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over?.id ?? null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    resetState();

    // if (projected && over) {
    //   const { depth, parentId } = projected;
    //   const clonedItems: FlattenedItem[] = JSON.parse(
    //     JSON.stringify(flatten(items)),
    //   );
    //   const overIndex = clonedItems.findIndex(({ id }) => id === over.id);
    //   const activeIndex = clonedItems.findIndex(({ id }) => id === active.id);
    //   const activeTreeItem = clonedItems[activeIndex];

    //   clonedItems[activeIndex] = { ...activeTreeItem, depth, parentId };

    //   const sortedItems = arrayMove(clonedItems, activeIndex, overIndex);
    //   const newItems = buildTree(sortedItems);

    //   setItems(newItems);
    // }
  };

  const handleDragCancel = () => {
    resetState();
  };

  return (
    <NavLink
      title="Pages"
      endAdornmentProps={{
        tooltipTitle: "Create new Page",
        onClick: addPage,
        "data-testid": "create-page-btn",
      }}
    >
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
          <TreeView
            data-testid="pages-tree"
            tabIndex={-1}
            sx={{
              mx: 0.75,
            }}
            {...(currentPageEntityId && { selected: currentPageEntityId })}
            expanded={expanded}
            onNodeToggle={handleToggle}
            onNodeSelect={handleSelect}
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
                expandable={!!node.children?.length}
              />
            ))}

            <DragOverlay dropAnimation={dropAnimationConfig} />
          </TreeView>
        </SortableContext>
      </DndContext>
    </NavLink>
  );
};
