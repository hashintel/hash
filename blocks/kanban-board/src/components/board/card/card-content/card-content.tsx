/* eslint-disable jsx-a11y/click-events-have-key-events */
import { useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { IconButton } from "../../../icon-button/icon-button";
import { DiscardIcon } from "../../../icons/discard-icon";

import styles from "./styles.module.scss";

export const CardContent = ({
  onChange,
  content,
  readonly,
  onDelete,
}: {
  content: string;
  onChange?: (value: string) => void;
  readonly?: boolean;
  onDelete?: () => void;
}) => {
  const [previousContent, setPreviousContent] = useState(content);
  const [inputValue, setInputValue] = useState(content);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);

  if (previousContent !== content) {
    setPreviousContent(content);
    setInputValue(content);
  }

  if (Boolean(readonly) || !editing) {
    return (
      <>
        <div
          role={"button"}
          tabIndex={0}
          className={styles.wrapper}
          onClick={() => { setEditing(true); }}
        >
          {content}
        </div>
        {!readonly && (
          <IconButton className={styles.deleteButton} onClick={onDelete}>
            <DiscardIcon />
          </IconButton>
        )}
      </>
    );
  }

  return (
    <TextareaAutosize
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
