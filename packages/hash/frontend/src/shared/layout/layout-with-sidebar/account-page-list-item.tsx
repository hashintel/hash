import { FunctionComponent, CSSProperties } from "react";
import { useSortable, AnimateLayoutChanges } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  PageTreeItem,
  PageTreeItemProps,
} from "./account-page-list/page-tree-item";

const animateLayoutChanges: AnimateLayoutChanges = ({
  isSorting,
  wasDragging,
}) => !(isSorting || wasDragging);

export const AccountPageListItem: FunctionComponent<PageTreeItemProps> = ({
  id,
  ...props
}) => {
  const {
    attributes,
    isDragging,
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
      id={id}
      ref={setDraggableNodeRef}
      wrapperRef={setDroppableNodeRef}
      attributes={attributes}
      listeners={listeners}
      isDragging={isDragging}
      style={style}
      {...props}
    />
  );
};
