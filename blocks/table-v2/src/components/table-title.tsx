import { useState } from "react";

interface TableTitleProps {
  title: string;
  onChange: (title: string) => Promise<void>;
}

export const TableTitle = ({ title, onChange }: TableTitleProps) => {
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

  if (!title && !editing) {
    return <button onClick={editTitle}>add title</button>;
  }

  return (
    <div style={{ display: "flex", gap: "1em" }}>
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
