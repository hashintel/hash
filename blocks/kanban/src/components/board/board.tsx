import { PlusIcon } from "../icons/plus-icon";
import { Column } from "./column/column";
import styles from "./styles.module.scss";
import { ColumnData } from "./types";

const columns: ColumnData[] = [
  {
    id: "1",
    title: "Column with a title",
    cards: [
      { id: "1", content: "Card with some content" },
      { id: "2", content: "Card with an slightly longer content goes here :)" },
    ],
  },
  {
    id: "2",
    title: "Column with a title",
    cards: [
      { id: "3", content: "Card with some content" },
      { id: "4", content: "Another card" },
    ],
  },
];

export const Board = () => {
  return (
    <div className={styles.board}>
      {columns.map((column) => (
        <Column key={column.id} data={column} />
      ))}
      <button className={styles.addColumnButton} type="button">
        Add another column
        <PlusIcon />
      </button>
    </div>
  );
};
