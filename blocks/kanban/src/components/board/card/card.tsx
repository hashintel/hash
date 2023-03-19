import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";

import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { CardData, UpdateCardContentCallback } from "../types";
import { EditableCardContent } from "./editable-card-content/editable-card-content";
import styles from "./styles.module.scss";

export const Card = ({
  data,
  onDelete,
  updateCardContent,
}: {
  data: CardData;
  onDelete: () => void;
  updateCardContent: UpdateCardContentCallback;
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
      <EditableCardContent
        content={data.content}
        onChange={(val) => updateCardContent(data.id, val)}
      />
      <IconButton onClick={onDelete}>
        <DiscardIcon />
      </IconButton>
    </div>
  );
};
