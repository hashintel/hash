import { PlusIcon } from "../../icons/plus-icon";
import { Card } from "../card/card";
import { ColumnData } from "../types";
import styles from "./styles.module.scss";

export const Column = ({ data }: { data: ColumnData }) => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>{data.title}</div>
      <div className={styles.body}>
        {data.cards.map((card) => (
          <Card key={card.id} data={card} />
        ))}
        <button className={styles.addCardButton} type="button">
          Add a card
          <PlusIcon />
        </button>
      </div>
    </div>
  );
};
