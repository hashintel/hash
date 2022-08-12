import { FunctionComponent, CSSProperties } from "react";
import { useSortable, AnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageTreeItem } from "./account-page-list/page-tree-item";
import TreeItem from "@mui/lab/TreeItem";

type AccountPageListItemProps = {
  node: TreeElement;
  accountId: string;
  depth: number;
  expandable: boolean;
};

type TreeElement = {
  entityId: string;
  parentPageEntityId: string;
  title: string;
  children?: TreeElement[];
};

const animateLayoutChanges: AnimateLayoutChanges = ({
  isSorting,
  wasDragging,
}) => !(isSorting || wasDragging);

export const AccountPageListItem: FunctionComponent<
  AccountPageListItemProps
> = ({ node, accountId, ...props }) => {
  const id = node.entityId;
  const {
    attributes,
    isDragging,
    // isSorting,
    listeners,
    setDraggableNodeRef,
    setDroppableNodeRef,
    transform,
    transition,
  } = useSortable({
    id,
    animateLayoutChanges,
  });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <PageTreeItem
      ref={setDraggableNodeRef}
      wrapperRef={setDroppableNodeRef}
      style={style}
      attributes={attributes}
      listeners={listeners}
      node={node}
      nodeId={node.entityId}
      label={node.title}
      url={`/${accountId}/${node.entityId}`}
      isDragging={isDragging}
      {...props}
    />
  );
};
