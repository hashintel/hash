/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useRef, useState } from "react";

import styles from "./styles.module.scss";

export const EditableColumnTitle = ({
  onChange,
  title,
  readonly,
}: {
  title: string;
  onChange?: (value: string) => void;
  readonly?: boolean;
}) => {
  const [previousTitle, setPreviousTitle] = useState(title);
  const [inputValue, setInputValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  if (previousTitle !== title) {
    setPreviousTitle(title);
    setInputValue(title);
  }

  if (Boolean(readonly) || !editing) {
    return (
      <div
        role={"button"}
        tabIndex={0}
        className={styles.wrapper}
        onClick={() => { setEditing(true); }}
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
      value={inputValue}
      onBlur={() => { setEditing(false); }}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === "Enter" || event.key === "Escape") {
          inputRef.current?.blur();
        }
      }}
      onChange={(event) => {
        setInputValue(event.target.value);
        onChange?.(event.target.value);
      }}
    />
  );
};
