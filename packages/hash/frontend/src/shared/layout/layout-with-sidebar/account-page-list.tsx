import {
  FunctionComponent,
  SyntheticEvent,
  useMemo,
  useState,
  useCallback,
} from "react";

import { treeFromParentReferences } from "@hashintel/hash-shared/util";
import { TreeView } from "@mui/lab";
import { useRouter } from "next/router";
import { useLocalstorageState } from "rooks";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
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

// const RenderTree = (
//   node: TreeElement,
//   accountId: string,
//   depth: number = 0,
// ) => {
//   const id = node.entityId;
//   const { attributes, listeners, setNodeRef, transform, transition } =
//     useSortable({ id });

//   const style = {
//     transform: CSS.Transform.toString(transform),
//     transition,
//   };

//   return (
//     <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
//       <PageTreeItem
//         key={node.entityId}
//         nodeId={node.entityId}
//         label={node.title}
//         depth={depth}
//         ContentProps={
//           {
//             /**
//              *  ContentProps type is currently limited to HtmlAttributes and unfortunately can't be augmented
//              *  Casting the type to any as a temporary workaround
//              * @see https://stackoverflow.com/a/69483286
//              * @see https://github.com/mui/material-ui/issues/28668
//              */
//             expandable: Boolean(
//               Array.isArray(node.children)
//                 ? node.children.length
//                 : node.children,
//             ),
//             url: `/${accountId}/${node.entityId}`,
//             depth,
//           } as any
//         }
//       >
//         {Array.isArray(node.children)
//           ? node.children.map((child) =>
//               RenderTree(child, accountId, depth + 1),
//             )
//           : null}
//       </PageTreeItem>
//     </div>
//   );
// };

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

  // const dropAnimationConfig: DropAnimation = {
  //   keyframes({ transform }) {
  //     return [
  //       {
  //         transform: CSS.Transform.toString(transform.initial),
  //       },
  //       {
  //         transform: CSS.Transform.toString({
  //           ...transform.final,
  //           scaleX: 0.95,
  //           scaleY: 0.95,
  //         }),
  //       },
  //     ];
  //   },
  //   duration: 250,
  //   sideEffects({ active }) {
  //     setDroppingId(active.id);

  //     if (dragOverlayRef.current) {
  //       dragOverlayRef.current.animate(
  //         [
  //           {
  //             boxShadow: draggingBoxShadow,
  //           },
  //           { boxShadow },
  //         ],
  //         {
  //           duration: 250,
  //           easing: "ease",
  //           fill: "forwards",
  //         },
  //       );
  //     }

  //     return () => {
  //       setDroppingId(null);
  //     };
  //   },
  // };

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
        onDragStart={
          ({ active }) => {
            console.log(active);
          }
          // setActiveIndex(findItemIndexById(list, active.id))
        }
        onDragEnd={({ active, over }) => {
          // setActiveIndex(null);

          // if (over?.id && active.id !== over?.id) {
          //   const sourceIndex = findItemIndexById(list, active.id);
          //   const destinationIndex = findItemIndexById(list, over.id);
          //   onReorder(sourceIndex, destinationIndex);
          // }
          console.log(active, over);
        }}
        // onDragCancel={() => setActiveIndex(null)}
        measuring={measuringConfig}
        modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
      >
        <SortableContext
          // items={formattedData.map((node) => node.entityId)}
          items={getFlatmap(formattedData).map((x) => x.entityId)}
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
            {formattedData.map((node) => (
              <AccountPageListItem
                key={node.entityId}
                node={node}
                accountId={accountId}
                depth={0}
              />
            ))}
          </TreeView>
        </SortableContext>
      </DndContext>
    </NavLink>
  );
};

const getFlatmap = (x: TreeElement[]) =>
  x.flatMap((x) => [x, ...(x.children! || [])]);
