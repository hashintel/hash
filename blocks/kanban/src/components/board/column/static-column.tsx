import { SortableContext } from "@dnd-kit/sortable";
import clsx from "clsx";

import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { PlusIcon } from "../../icons/plus-icon";
import { StaticCard } from "../card/static-card";
import { ColumnData } from "../types";
import styles from "./styles.module.scss";

export const StaticColumn = ({ data }: { data: ColumnData }) => {
  return (
    <div className={styles.wrapper}>
      <div className={clsx(styles.titleRow)}>
        <div className={styles.title}>{data.title}</div>
        <IconButton>
          <DiscardIcon />
        </IconButton>
      </div>
      <div className={styles.body}>
        <SortableContext items={data.cards.map((card) => card.id)} id={data.id}>
          {data.cards.map((card) => (
            <StaticCard key={card.id} data={card} />
          ))}
        </SortableContext>
        <button className={styles.addCardButton} type="button">
          Add a card
          <PlusIcon />
        </button>
      </div>
    </div>
  );
};
