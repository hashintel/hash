import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";

import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { CardData } from "../types";
import styles from "./styles.module.scss";

export const Card = ({
  data,
  onDelete,
}: {
  data: CardData;
  onDelete: () => void;
}) => {
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
    <div
      className={clsx(
        styles.wrapper,
        (isDragging || isSorting) && styles.showHandCursor,
      )}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      {data.content}
      <IconButton onClick={onDelete}>
        <DiscardIcon />
      </IconButton>
    </div>
  );
};
