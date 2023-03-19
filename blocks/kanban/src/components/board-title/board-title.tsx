import clsx from "clsx";
import { useState } from "react";

import { IconButton } from "../icon-button/icon-button";
import { DiscardIcon } from "../icons/discard-icon";
import { EditIcon } from "../icons/edit-icon";
import { SaveIcon } from "../icons/save-icon";
import styles from "./styles.module.scss";

interface BoardTitleProps {
  title: string;
  onChange: (title: string) => void;
  readonly?: boolean;
}

const TITLE_PLACEHOLDER = "Untitled Board";

export const BoardTitle = ({ title, onChange, readonly }: BoardTitleProps) => {
  const [prevTitle, setPrevTitle] = useState(title);

  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(title);

  const editTitle = () => setEditing(true);

  const saveTitle = () => {
    setEditing(false);

    onChange(inputValue.trim());
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
        <IconButton onClick={editTitle} className={styles.edit}>
          <EditIcon />
        </IconButton>
      )}

      {editing && (
        <>
          <IconButton onClick={discardTitle}>
            <DiscardIcon />
          </IconButton>
          <IconButton onClick={saveTitle}>
            <SaveIcon />
          </IconButton>
        </>
      )}
    </div>
  );
};
