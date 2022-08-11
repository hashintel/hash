import { CSSProperties, FunctionComponent } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { AnimateLayoutChanges, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { TreeItem, TreeItemProps } from "./tree-item";
// import { iOS } from "../../utilities";

interface SortableTreeItemProps extends TreeItemProps {
  id: UniqueIdentifier;
  depth: number;
}

const animateLayoutChanges: AnimateLayoutChanges = ({
  isSorting,
  wasDragging,
}) => !(isSorting || wasDragging);

export const SortableTreeItem: FunctionComponent<SortableTreeItemProps> = ({
  id,
  depth,
  ...props
}) => {
  const {
    attributes,
    // isDragging,
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
    <TreeItem
      ref={setDraggableNodeRef}
      wrapperRef={setDroppableNodeRef}
      style={style}
      depth={depth}
      // ghost={isDragging}
      // disableSelection={iOS}
      // disableInteraction={isSorting}
      handleProps={{
        ...attributes,
        ...listeners,
      }}
      {...props}
    />
  );
};
