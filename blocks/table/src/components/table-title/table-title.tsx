import clsx from "clsx";
import { useState } from "react";
import styles from "./styles.module.scss";

interface TableTitleProps {
  title: string;
  onChange: (title: string) => Promise<void>;
  readonly?: boolean;
}

const TITLE_PLACEHOLDER = "Untitled Table";

export const TableTitle = ({ title, onChange, readonly }: TableTitleProps) => {
  const [prevTitle, setPrevTitle] = useState(title);

  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(title);

  const editTitle = () => setEditing(true);

  const saveTitle = async () => {
    setEditing(false);

    await onChange(inputValue.trim());
  };

  const discardTitle = () => {
    setInputValue(title);
    setEditing(false);
  };

  if (title !== prevTitle) {
    setPrevTitle(title);
    setEditing(false);
    setInputValue(title);
  }

  return (
    <div className={styles.wrapper}>
      {editing ? (
        <input
          className={clsx(styles.title, styles.titleInput)}
          autoFocus
          placeholder={TITLE_PLACEHOLDER}
          defaultValue={title}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              return saveTitle();
            }
            if (event.key === "Escape") {
              return discardTitle();
            }
          }}
        />
      ) : (
        <div className={clsx(styles.title, !title.length && styles.empty)}>
          {title || TITLE_PLACEHOLDER}
        </div>
      )}

      {!editing && !readonly && (
        <div
          onClick={editTitle}
          className={clsx(styles.iconButton, styles.edit)}
        />
      )}

      {editing && (
        <>
          <div
            className={clsx(styles.iconButton, styles.cancel)}
            onClick={discardTitle}
          />
          <div
            className={clsx(styles.iconButton, styles.save)}
            onClick={saveTitle}
          />
        </>
      )}
    </div>
  );
};
