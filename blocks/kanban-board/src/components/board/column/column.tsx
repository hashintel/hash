import { SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { useMemo } from "react";

import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { PlusIcon } from "../../icons/plus-icon";
import { Card } from "../card/card";
import {
  ColumnData,
  CreateCardCallback,
  DeleteCardCallback,
  DeleteColumnCallback,
  UpdateCardContentCallback,
  UpdateColumnTitleCallback,
} from "../types";
import { EditableColumnTitle } from "./editable-column-title/editable-column-title";
import styles from "./styles.module.scss";

interface ColumnProps {
  data: ColumnData;
  deleteColumn: DeleteColumnCallback;
  createCard: CreateCardCallback;
  deleteCard: DeleteCardCallback;
  updateColumnTitle: UpdateColumnTitleCallback;
  updateCardContent: UpdateCardContentCallback;
  readonly?: boolean;
}

export const Column = ({
  data,
  deleteColumn,
  createCard,
  deleteCard,
  updateCardContent,
  updateColumnTitle,
  readonly,
}: ColumnProps) => {
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

  const sortableItems = useMemo(
    () => data.cards.map((card) => card.id),
    [data.cards],
  );

  return (
    <div
      className={styles.wrapper}
      ref={setNodeRef}
      style={style}
      {...attributes}
    >
      <div
        className={clsx(
          styles.titleRow,
          (isDragging || isSorting) && styles.showHandCursor,
        )}
        {...listeners}
      >
        <EditableColumnTitle
          title={data.title}
          onChange={(val) => updateColumnTitle(data.id, val)}
          readonly={readonly}
        />
        {!readonly && (
          <IconButton onClick={() => deleteColumn(data.id)}>
            <DiscardIcon />
          </IconButton>
        )}
      </div>
      <div className={styles.body}>
        <SortableContext items={sortableItems} id={data.id} disabled={readonly}>
          {data.cards.map((card) => (
            <Card
              key={card.id}
              data={card}
              onDelete={() => deleteCard(data.id, card.id)}
              updateCardContent={updateCardContent}
              readonly={readonly}
            />
          ))}
        </SortableContext>
        {!readonly && (
          <button
            className={styles.addCardButton}
            type="button"
            onClick={() => createCard(data.id, "New card")}
          >
            Add a card
            <PlusIcon />
          </button>
        )}
      </div>
    </div>
  );
};
