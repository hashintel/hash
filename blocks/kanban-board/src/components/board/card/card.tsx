import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";

import type { CardData, UpdateCardContentCallback } from "../types";
import { CardContent } from "./card-content/card-content";
import styles from "./styles.module.scss";

export const Card = ({
  data,
  onDelete,
  updateCardContent,
  readonly,
}: {
  data: CardData;
  onDelete: () => void;
  updateCardContent?: UpdateCardContentCallback;
  readonly?: boolean;
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
      <CardContent
        content={data.content}
        onChange={(val) => updateCardContent?.(data.id, val)}
        readonly={readonly}
        onDelete={() => onDelete()}
      />
    </div>
  );
};
