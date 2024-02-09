/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useRef, useState } from "react";

import styles from "./styles.module.scss";

export const EditableColumnTitle = ({
  onChange,
  title,
  readonly,
}: {
  title: string;
  onChange?: (val: string) => void;
  readonly?: boolean;
}) => {
  const [prevTitle, setPrevTitle] = useState(title);
  const [inputVal, setInputVal] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  if (prevTitle !== title) {
    setPrevTitle(title);
    setInputVal(title);
  }

  if (!!readonly || !editing) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        className={styles.wrapper}
      >
        {title}
      </div>
    );
  }

  return (
    <input
      autoFocus
      ref={inputRef}
      className={styles.wrapper}
      value={inputVal}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === "Enter" || event.key === "Escape") {
          inputRef.current?.blur();
        }
      }}
      onChange={(event) => {
        setInputVal(event.target.value);
        onChange?.(event.target.value);
      }}
    />
  );
};
