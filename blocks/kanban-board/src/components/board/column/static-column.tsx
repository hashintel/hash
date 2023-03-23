import { SortableContext } from "@dnd-kit/sortable";
import clsx from "clsx";

import { IconButton } from "../../icon-button/icon-button";
import { DiscardIcon } from "../../icons/discard-icon";
import { PlusIcon } from "../../icons/plus-icon";
import { StaticCard } from "../card/static-card";
import { ColumnData } from "../types";
import { EditableColumnTitle } from "./editable-column-title/editable-column-title";
import styles from "./styles.module.scss";

export const StaticColumn = ({ data }: { data: ColumnData }) => {
  return (
    <div className={styles.wrapper} style={{ boxShadow: "var(--shadow-3)" }}>
      <div className={clsx(styles.titleRow)}>
        <EditableColumnTitle readonly title={data.title} />
        <IconButton>
          <DiscardIcon />
        </IconButton>
      </div>
      <div className={styles.body}>
        <SortableContext
          items={data.cards.map((card) => card.id)}
          id={data.id}
          disabled
        >
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
