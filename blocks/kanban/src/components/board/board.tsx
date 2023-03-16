import { useState } from "react";

import { PlusIcon } from "../icons/plus-icon";
import { Column } from "./column/column";
import styles from "./styles.module.scss";
import { ColumnData, defaultColumns } from "./types";

const generateId = () => Date.now().toString();

export const Board = () => {
  const [columns, setColumns] = useState<ColumnData[]>(defaultColumns);

  const deleteColumn = (columnId: string) => {
    setColumns((cols) => cols.filter((col) => col.id !== columnId));
  };

  const createColumn = () => {
    setColumns((cols) => [
      ...cols,
      {
        id: generateId(),
        title: `Column ${cols.length + 1}`,
        cards: [],
      },
    ]);
  };

  const createCard = (columnId: string, content: string) => {
    setColumns((cols) =>
      cols.map((col) =>
        col.id === columnId
          ? { ...col, cards: [...col.cards, { id: generateId(), content }] }
          : col,
      ),
    );
  };

  const deleteCard = (columnId: string, cardId: string) => {
    setColumns((cols) =>
      cols.map((col) =>
        col.id === columnId
          ? { ...col, cards: col.cards.filter((card) => card.id !== cardId) }
          : col,
      ),
    );
  };

  return (
    <div className={styles.board}>
      {columns.map((column) => (
        <Column
          key={column.id}
          data={column}
          deleteColumn={deleteColumn}
          createCard={createCard}
          deleteCard={deleteCard}
        />
      ))}
      <button
        className={styles.addColumnButton}
        type="button"
        onClick={createColumn}
      >
        Add another column
        <PlusIcon />
      </button>
    </div>
  );
};
