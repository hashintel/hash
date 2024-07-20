import { useMemo } from "react";
import { SortableContext } from "@dnd-kit/sortable";
import { PlusIcon } from "@hashintel/design-system";

import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { Card } from "../card/card";

import { EditableColumnTitle } from "./editable-column-title/editable-column-title";
import styles from "./styles.module.scss";
import type { ColumnProps } from "./types";

export const Column = ({
  data,
  deleteColumn,
  createCard,
  deleteCard,
  updateCardContent,
  updateColumnTitle,
  readonly,
  wrapperProps,
  titleWrapperProps,
}: ColumnProps) => {
  const sortableItems = useMemo(
    () => data.cards.map((card) => card.id),
    [data.cards],
  );

  return (
    <div className={styles.wrapper} {...wrapperProps}>
      <div className={styles.titleRow} {...titleWrapperProps}>
        <EditableColumnTitle
          title={data.title}
          readonly={readonly}
          onChange={(value) => updateColumnTitle?.(data.id, value)}
        />
        {!readonly && (
          <IconButton onClick={() => deleteColumn?.(data.id)}>
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
              updateCardContent={updateCardContent}
              readonly={readonly}
              onDelete={() => deleteCard?.(data.id, card.id)}
            />
          ))}
        </SortableContext>
        {!readonly && (
          <button
            className={styles.addCardButton}
            type={"button"}
            onClick={() => createCard?.(data.id, "New card")}
          >
            Add a card
            <PlusIcon />
          </button>
        )}
      </div>
    </div>
  );
};
