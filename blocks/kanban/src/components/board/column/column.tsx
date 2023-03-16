import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { PlusIcon } from "../../icons/plus-icon";
import { Card } from "../card/card";
import { ColumnData } from "../types";
import styles from "./styles.module.scss";

export const Column = ({
  data,
  deleteColumn,
  createCard,
  deleteCard,
}: {
  data: ColumnData;
  deleteColumn: (columnId: string) => void;
  createCard: (columnId: string, content: string) => void;
  deleteCard: (columnId: string, cardId: string) => void;
}) => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.titleRow}>
        <div className={styles.title}>{data.title}</div>
        <IconButton onClick={() => deleteColumn(data.id)}>
          <DiscardIcon />
        </IconButton>
      </div>
      <div className={styles.body}>
        {data.cards.map((card) => (
          <Card
            key={card.id}
            data={card}
            onDelete={() => deleteCard(data.id, card.id)}
          />
        ))}
        <button
          className={styles.addCardButton}
          type="button"
          onClick={() => createCard(data.id, "This is a new card!")}
        >
          Add a card
          <PlusIcon />
        </button>
      </div>
    </div>
  );
};
