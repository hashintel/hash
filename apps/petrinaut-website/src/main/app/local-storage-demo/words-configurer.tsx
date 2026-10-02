import { useId, useRef, useState } from "react";

import { Button, Dialog, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { ConversationWord } from "./conversation-words";
import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

export const isTeachableVoiceMessage = (message: PetrinautAiMessage): boolean =>
  message.role === "user" &&
  message.metadata?.source === "voice" &&
  !message.parts.some(
    (part) => part.type === "text" && part.state === "streaming",
  ) &&
  message.parts.some(
    (part) => part.type === "text" && part.text.trim().length > 0,
  );

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

/** The form only saves hints. It never submits or changes the contextual caption. */
export const WordsConfigurer = ({
  entries,
  ready,
  notice,
  save,
  onClose,
  context,
}: {
  entries: readonly ConversationWord[];
  ready: boolean;
  notice: string | null;
  save: (entries: readonly ConversationWord[]) => void;
  onClose: () => void;
  context?: string;
}) => {
  const id = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<{
    id?: string;
    spelling: string;
    pronunciation: string;
  } | null>(context === undefined ? null : { spelling: "", pronunciation: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const finish = () => {
    setEditing(null);
    setError(null);
    requestAnimationFrame(() => addButton.current?.focus());
  };
  return (
    <Dialog size="sm" onClose={onClose} aria-label="Words for Brunch">
      <Dialog.Header
        title={
          editing
            ? editing.id
              ? "Edit word"
              : context
                ? "Teach this word"
                : "Add a word"
            : "Words for Brunch"
        }
        description="Names and terms for this conversation."
      />
      <Dialog.Body>
        <div className={stackStyle}>
          {notice && <p role="alert">{notice}</p>}
          {editing ? (
            <form
              className={stackStyle}
              onSubmit={(event) => {
                event.preventDefault();
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
              {context && (
                <div
                  className={css({
                    background: "neutral.s10",
                    borderRadius: "lg",
                    padding: "3",
                  })}
                >
                  <p className={mutedStyle}>Original transcript · unchanged</p>
                  <blockquote>{context}</blockquote>
                </div>
              )}
              <span id={`${id}-spelling`}>Correct spelling</span>
              <TextInput
                aria-labelledby={`${id}-spelling`}
                // Explicit Add/Teach opens this dialog form and should focus its first field.
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
                Up to 80 spelling characters and 120 pronunciation characters.
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
                <Button type="submit" disabled={!ready}>
                  Save word
                </Button>
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
                <span className={mutedStyle}>{entries.length} of 20 words</span>
                <Button
                  ref={addButton}
                  size="sm"
                  disabled={!ready || entries.length >= 20}
                  onClick={() => {
                    setEditing({ spelling: "", pronunciation: "" });
                    setSaved(false);
                  }}
                >
                  Add word
                </Button>
              </div>
              {entries.length === 0 ? (
                <p>
                  No words yet. Add a name Brunch tends to mishear, or choose
                  “Teach this word” beneath a finished voice transcript.
                </p>
              ) : (
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
                  {notice ? "Updated in this tab." : "Saved."} Restart Voice to
                  apply hearing and pronunciation changes.
                </p>
              )}
            </>
          )}
          <div className={mutedStyle}>
            <p>
              Spellings help Brunch’s next request and the next Voice session’s
              transcription prompt. Pronunciation notes go only to the speaking
              model. Hints are best effort.
            </p>
            <p>
              Restart Voice after adding, editing, removing, or disabling words.
              An active session keeps its starting list.
            </p>
            <p>
              Saved in this browser for this conversation; Clear conversation
              starts an empty list. Used spellings go to Brunch’s model provider
              and voice hints go to OpenAI. Removing a word does not erase past
              requests.
            </p>
          </div>
        </div>
      </Dialog.Body>
    </Dialog>
  );
};
