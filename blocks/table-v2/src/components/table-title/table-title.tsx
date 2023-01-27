import { useState } from "react";
import styles from "./styles.module.scss";

interface TableTitleProps {
  title: string;
  onChange: (title: string) => Promise<void>;
  readonly?: boolean;
}

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

  if (readonly) {
    if (!title) return null;

    return (
      <div className={styles.wrapper}>
        <h2>{title}</h2>
      </div>
    );
  }

  if (!title && !editing) {
    return (
      <div className={styles.wrapper}>
        <button onClick={editTitle}>add title</button>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {editing ? (
        <input
          autoFocus
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
        <h2>{title}</h2>
      )}

      {!editing && <button onClick={editTitle}>edit</button>}
      {editing && (
        <>
          <button onClick={discardTitle}>cancel</button>
          <button onClick={saveTitle}>save</button>
        </>
      )}
    </div>
  );
};
