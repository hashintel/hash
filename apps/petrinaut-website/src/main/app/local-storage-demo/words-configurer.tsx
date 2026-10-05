import { useId, useRef, useState } from "react";
import { LuBookOpen } from "react-icons/lu";

import { Button, Dialog, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  maxPronunciationLength,
  maxSpellingLength,
  maxWords,
} from "../../../shared/voice-words";

import type { ConversationWord } from "./conversation-words";

const stackStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  fontSize: "sm",
  color: "neutral.fg.body",
});
const mutedStyle = css({
  fontSize: "xs",
  lineHeight: "[1.6]",
  color: "neutral.fg.subtle",
});
const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingY: "2.5",
  borderBottom: "[1px solid {colors.neutral.s30}]",
});

/** The form only saves hints. It never submits a message. */
export const WordsConfigurer = ({
  entries,
  notice,
  save,
  onClose,
}: {
  entries: readonly ConversationWord[];
  notice: string | null;
  save: (entries: readonly ConversationWord[]) => void;
  onClose: () => void;
}) => {
  const id = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<{
    id?: string;
    spelling: string;
    pronunciation: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const finish = () => {
    setEditing(null);
    setError(null);
    requestAnimationFrame(() => addButton.current?.focus());
  };
  return (
    <Dialog size="sm" onClose={onClose} aria-label="Custom words">
      <Dialog.Header
        title={
          editing ? (editing.id ? "Edit word" : "Add a word") : "Custom words"
        }
        description="Help recognize and pronounce names and terms."
      />
      <Dialog.Body>
        <div className={stackStyle}>
          {notice && <p role="alert">{notice}</p>}
          {editing ? (
            <form
              className={stackStyle}
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  editing.id &&
                  !entries.some((entry) => entry.id === editing.id)
                ) {
                  setError(
                    "This word was removed. Cancel and add it again to save your changes.",
                  );
                  return;
                }
                const word: ConversationWord = {
                  id: editing.id ?? crypto.randomUUID(),
                  spelling: editing.spelling,
                  ...(editing.pronunciation.trim()
                    ? { pronunciation: editing.pronunciation }
                    : {}),
                };
                try {
                  save(
                    editing.id
                      ? entries.map((entry) =>
                          entry.id === editing.id ? word : entry,
                        )
                      : [...entries, word],
                  );
                  setSaved(true);
                  finish();
                } catch (failure) {
                  setError(
                    failure instanceof Error
                      ? failure.message
                      : "Could not save this word.",
                  );
                }
              }}
            >
              <span id={`${id}-spelling`}>Correct spelling</span>
              <TextInput
                aria-labelledby={`${id}-spelling`}
                // Explicit Add/Edit opens this dialog form and should focus its first field.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={editing.spelling}
                onChange={(spelling) => setEditing({ ...editing, spelling })}
                placeholder="e.g. RelayDesk"
                aria-describedby={error ? `${id}-error` : undefined}
              />
              <span id={`${id}-pronunciation`}>
                Pronunciation note (optional)
              </span>
              <TextInput
                aria-labelledby={`${id}-pronunciation`}
                value={editing.pronunciation}
                onChange={(pronunciation) =>
                  setEditing({ ...editing, pronunciation })
                }
                placeholder="e.g. relay desk"
              />
              <p className={mutedStyle}>
                A short, plain-text sound hint. No definitions or instructions.
                Up to {maxSpellingLength} spelling characters and{" "}
                {maxPronunciationLength} pronunciation characters.
              </p>
              {error && (
                <p id={`${id}-error`} role="alert">
                  {error}
                </p>
              )}
              <div
                className={css({
                  display: "flex",
                  gap: "2",
                  justifyContent: "flex-end",
                })}
              >
                <Button type="button" variant="subtle" onClick={finish}>
                  Cancel
                </Button>
                <Button type="submit">Save word</Button>
              </div>
            </form>
          ) : (
            <>
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "2",
                })}
              >
                <span className={mutedStyle}>
                  {entries.length} of {maxWords} words
                </span>
                <Button
                  ref={addButton}
                  size="sm"
                  disabled={entries.length >= maxWords}
                  onClick={() => {
                    setEditing({ spelling: "", pronunciation: "" });
                    setSaved(false);
                  }}
                >
                  Add word
                </Button>
              </div>
              {entries.length > 0 && (
                <ul
                  className={css({
                    listStyle: "none",
                    margin: "0",
                    padding: "0",
                  })}
                >
                  {entries.map((word) => (
                    <li key={word.id} className={rowStyle}>
                      <div
                        className={css({
                          flex: "[1]",
                          minWidth: "[0]",
                          overflowWrap: "anywhere",
                        })}
                      >
                        <strong>{word.spelling}</strong>
                        {word.pronunciation && (
                          <p className={mutedStyle}>{word.pronunciation}</p>
                        )}
                      </div>
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label={`Edit ${word.spelling}`}
                        onClick={() => {
                          setEditing({
                            id: word.id,
                            spelling: word.spelling,
                            pronunciation: word.pronunciation ?? "",
                          });
                          setSaved(false);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label={`Remove ${word.spelling}`}
                        onClick={() => {
                          save(entries.filter((entry) => entry.id !== word.id));
                          setSaved(true);
                          addButton.current?.focus();
                        }}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {saved && (
                <p role="status">
                  {notice ? "Updated in this tab." : "Saved."}
                </p>
              )}
            </>
          )}
          <div className={mutedStyle}>
            <p>
              Changes apply to your next request. Restart Voice to apply them to
              hearing and speaking. Words are saved in this browser and cleared
              with this conversation.
            </p>
          </div>
        </div>
      </Dialog.Body>
    </Dialog>
  );
};

/**
 * Owns the dialog's open state, so leaving Voice (which unmounts the header
 * actions) closes the dialog for good instead of reopening it on return.
 */
export const WordsHeaderAction = (
  props: Omit<Parameters<typeof WordsConfigurer>[0], "onClose">,
) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="xs"
        variant="ghost"
        aria-label="Words"
        prefix={
          <LuBookOpen
            aria-hidden="true"
            size={14}
            className={css({
              display: "inline-block",
              verticalAlign: "middle",
            })}
          />
        }
        onClick={() => setOpen(true)}
      >
        Words
      </Button>
      {open && <WordsConfigurer {...props} onClose={() => setOpen(false)} />}
    </>
  );
};
