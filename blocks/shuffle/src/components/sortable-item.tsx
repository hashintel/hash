import type { AnimateLayoutChanges } from "@dnd-kit/sortable";
import { defaultAnimateLayoutChanges, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
// @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
// removed React import
import type { FunctionComponent } from "react";

import type { ItemProps } from "./item";
import { Item } from "./item";

const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, isDragging, wasDragging } = args;

  if (isSorting || isDragging || wasDragging) {
    return defaultAnimateLayoutChanges(args);
  }

  return true;
};

export const SortableItem: FunctionComponent<ItemProps> = ({
  id,
  ...props
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id, animateLayoutChanges });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Item
      id={id}
      ref={setNodeRef}
      style={style}
      attributes={attributes}
      listeners={listeners}
      {...props}
    />
  );
};
