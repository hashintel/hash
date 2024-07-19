import clsx from "clsx";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
      ref={setNodeRef}
      style={style}
      className={clsx(
        styles.wrapper,
        (isDragging || isSorting) && styles.showHandCursor,
      )}
      {...attributes}
      {...listeners}
    >
      <CardContent
        content={data.content}
        readonly={readonly}
        onChange={(value) => updateCardContent?.(data.id, value)}
        onDelete={() => { onDelete(); }}
      />
    </div>
  );
};
