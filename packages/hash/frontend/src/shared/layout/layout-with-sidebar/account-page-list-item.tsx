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
import { useAccountPages } from "../../../components/hooks/useAccountPages";
import { useCreatePage } from "../../../components/hooks/useCreatePage";
import { NavLink } from "./nav-link";
import { PageTreeItem } from "./account-page-list/page-tree-item";

type AccountPageListItemProps = {
  node: TreeElement;
  accountId: string;
  depth: number;
};

type TreeElement = {
  entityId: string;
  parentPageEntityId: string;
  title: string;
  children?: TreeElement[];
};

export const AccountPageListItem: FunctionComponent<
  AccountPageListItemProps
> = ({ node, accountId, depth }) => {
  const id = node.entityId;
  // const { attributes, listeners, setNodeRef, transform, transition } =
  //   useSortable({ id });

  // const style = {
  //   transform: CSS.Transform.toString(transform),
  //   transition,
  // };

  return (
    // <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
    <PageTreeItem
      // ref={setNodeRef}
      // style={style}
      // {...attributes}
      // {...listeners}
      key={node.entityId}
      nodeId={node.entityId}
      label={node.title}
      depth={depth}
      ContentProps={
        {
          /**
           *  ContentProps type is currently limited to HtmlAttributes and unfortunately can't be augmented
           *  Casting the type to any as a temporary workaround
           * @see https://stackoverflow.com/a/69483286
           * @see https://github.com/mui/material-ui/issues/28668
           */
          expandable: Boolean(
            Array.isArray(node.children) ? node.children.length : node.children,
          ),
          url: `/${accountId}/${node.entityId}`,
          depth,
        } as any
      }
    >
      {Array.isArray(node.children)
        ? node.children.map((child) => (
            <AccountPageListItem
              key={child.entityId}
              node={child}
              accountId={accountId}
              depth={depth + 1}
            />
          ))
        : null}
    </PageTreeItem>
    // </div>
  );
};
