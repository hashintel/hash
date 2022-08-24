import { FunctionComponent, CSSProperties } from "react";
import {
  useSortable,
  AnimateLayoutChanges,
  defaultAnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageTreeItem, PageTreeItemProps } from "./page-tree-item";

const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, isDragging, wasDragging } = args;

  if (isSorting || isDragging || wasDragging) {
    return defaultAnimateLayoutChanges(args);
  }

  return true;
};

export const AccountPageListItem: FunctionComponent<PageTreeItemProps> = ({
  id,
  ...props
}) => {
  const {
    isSorting,
    attributes,
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
      isSorting={isSorting}
      style={style}
      {...props}
    />
  );
};
