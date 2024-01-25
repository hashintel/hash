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
  onChange?: (val: string) => void;
  readonly?: boolean;
  onDelete?: () => void;
}) => {
  const [prevContent, setPrevContent] = useState(content);
  const [inputVal, setInputVal] = useState(content);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);

  if (prevContent !== content) {
    setPrevContent(content);
    setInputVal(content);
  }

  if (!!readonly || !editing) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditing(true)}
          className={styles.wrapper}
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
