import type { AnimateLayoutChanges } from "@dnd-kit/sortable";
import { defaultAnimateLayoutChanges, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, FunctionComponent } from "react";

import type { PageTreeItemProps } from "./page-tree-item";
import { PageTreeItem } from "./page-tree-item";

const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, isDragging, wasDragging } = args;

  if (wasDragging) {
    return false;
  }

  if (isSorting || isDragging) {
    return defaultAnimateLayoutChanges(args);
  }

  return true;
};

export const AccountPageListItem: FunctionComponent<PageTreeItemProps> = ({
  pageEntityId: id,
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
      pageEntityId={id}
      ref={setDraggableNodeRef}
      dragProps={{
        attributes,
        listeners,
        isSorting,
        style,
        wrapperRef: setDroppableNodeRef,
      }}
      {...props}
    />
  );
};
