import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";

import { Column } from "./column";
import styles from "./styles.module.scss";
import type { SortableColumnProps } from "./types";

export const SortableColumn = (props: SortableColumnProps) => {
  const { data } = props;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({ id: data.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Column
      {...props}
      wrapperProps={{
        ref: setNodeRef,
        style,
        ...attributes,
      }}
      titleWrapperProps={{
        className: clsx(
          styles.titleRow,
          (isDragging || isSorting) && styles.showHandCursor,
        ),
        ...listeners,
      }}
    />
  );
};
