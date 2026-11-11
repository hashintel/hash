/**
 * PROTOTYPE (FE-1594, throwaway): questions docked on the composer, one at a
 * time, after Lu's wireframes of 2026-11-11. Nothing is drawn in the chat
 * stream. Two forms: a list of rows (label and value) and a row of buttons
 * (label only).
 */
import { Button, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { DockQuestion } from "./prototype-dock-scenarios";

export type DockAnswer = {
  /** Positions of the chosen options. */
  picked: number[];
  /** The person's own words, used while `ownOn`. */
  own: string;
  ownOn: boolean;
};

export const emptyAnswer: DockAnswer = { picked: [], own: "", ownOn: false };

export const answerText = (question: DockQuestion, answer: DockAnswer) => {
  const parts = [...answer.picked]
    .sort((left, right) => left - right)
    .flatMap((position) => {
      const option = question.options[position];
      return option ? [option.value ?? option.label] : [];
    });
  if (answer.ownOn && answer.own.trim() !== "") parts.push(answer.own.trim());
  return parts.length > 0 ? parts.join("; ") : undefined;
};

/** The one message the answers become, with `note` as a closing paragraph. */
export const composeDockMessage = (
  questions: readonly DockQuestion[],
  answers: readonly DockAnswer[],
  note: string,
): string | undefined => {
  const texts = questions.map((question, index) =>
    answerText(question, answers[index] ?? emptyAnswer),
  );
  const closing = note.trim();
  if (texts.every((text) => text === undefined))
    return closing === "" ? undefined : closing;

  const only = texts[0];
  const body =
    questions.length === 1 && only !== undefined
      ? only
      : [
          ...questions.flatMap(({ label }, index) => {
            const text = texts[index];
            return text === undefined
              ? []
              : [`${index + 1}. ${label}: ${text}`];
          }),
          ...(texts.some((text) => text === undefined)
            ? [
                "",
                `Not answered yet: ${questions
                  .filter((_question, index) => texts[index] === undefined)
                  .map(({ label }) => label)
                  .join(", ")}.`,
              ]
            : []),
        ].join("\n");
  return closing === "" ? body : `${body}\n\n${closing}`;
};

const dockStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingBottom: "1",
});
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
  minHeight: "[28px]",
});
const counterStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
});
const arrowsStyle = css({ display: "flex", gap: "1" });
const preambleStyle = css({
  color: "neutral.s110",
  fontSize: "sm",
  lineHeight: "[1.45]",
});
const rowsStyle = css({ display: "flex", flexDirection: "column", gap: "0.5" });
const rowStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  paddingY: "1",
  paddingX: "1.5",
  borderRadius: "md",
  cursor: "pointer",
  fontSize: "sm",
  _hover: { backgroundColor: "neutral.s10" },
  "&[data-selected]": { backgroundColor: "neutral.s20" },
});
const boxStyle = css({ flexShrink: 0, position: "relative", top: "[2px]" });
const optionLabelStyle = css({
  flexShrink: 0,
  fontWeight: "semibold",
  color: "neutral.s120",
});
const optionValueStyle = css({ color: "neutral.s90", fontSize: "xs" });
const lineInputStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  border: "none",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  backgroundColor: "[transparent]",
  fontSize: "sm",
  paddingY: "0.5",
  outline: "none",
  _focus: { borderBottomColor: "neutral.s90" },
});
const buttonsStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5" });
const hintStyle = css({ color: "neutral.s80", fontSize: "xs" });
const footerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});

export const PrototypeDock = ({
  questions,
  answers,
  current,
  form,
  other,
  multiple,
  onCurrent,
  onPick,
  onOther,
  onOwn,
  onSend,
}: {
  questions: readonly DockQuestion[];
  answers: readonly DockAnswer[];
  current: number;
  form: "list" | "buttons";
  /** Where the person's own words are typed. */
  other: "inline" | "composer";
  multiple: boolean;
  onCurrent: (index: number) => void;
  onPick: (position: number) => void;
  /** Turns the free-text choice on or off for the question showing. */
  onOther: () => void;
  onOwn: (text: string) => void;
  onSend: () => void;
}) => {
  const question = questions[current];
  const answer = answers[current] ?? emptyAnswer;
  if (!question) return null;
  const several = questions.length > 1;
  const answered = questions.filter((each, index) =>
    answerText(each, answers[index] ?? emptyAnswer),
  ).length;
  const typedOnly = question.options.length === 0;
  const picked = (position: number) => answer.picked.includes(position);
  const choiceType = multiple ? "checkbox" : "radio";
  const chosenValues = answer.picked.flatMap((position) => {
    const value = question.options[position]?.value;
    return value === undefined ? [] : [value];
  });

  const ownField = (label: string) => (
    <TextInput
      aria-label={label}
      size="sm"
      width="fullWidth"
      placeholder="Your answer"
      value={answer.own}
      onChange={onOwn}
    />
  );
  const composerHint = (
    <span className={hintStyle}>
      Type your answer in the message box below.
    </span>
  );

  return (
    <section
      className={dockStyle}
      aria-label="Brunch's questions"
      data-prototype-dock
    >
      <div className={headerStyle}>
        <span className={counterStyle}>
          {several ? `Question ${current + 1}/${questions.length} · ` : ""}
          {question.label}
        </span>
        {several && (
          <span className={arrowsStyle}>
            <Button
              size="sm"
              variant="subtle"
              aria-label="Previous question"
              disabled={current === 0}
              onClick={() => onCurrent(current - 1)}
            >
              ←
            </Button>
            <Button
              size="sm"
              variant="subtle"
              aria-label="Next question"
              disabled={current === questions.length - 1}
              onClick={() => onCurrent(current + 1)}
            >
              →
            </Button>
          </span>
        )}
      </div>
      <p className={preambleStyle}>{question.preamble}</p>

      {typedOnly &&
        (other === "inline" ? ownField(question.label) : composerHint)}

      {!typedOnly && form === "list" && (
        <div
          className={rowsStyle}
          role={multiple ? "group" : "radiogroup"}
          aria-label={question.label}
        >
          {question.options.map((option, position) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: an option's place is its identity
            <label
              key={position}
              className={rowStyle}
              data-selected={picked(position) || undefined}
            >
              <input
                className={boxStyle}
                type={choiceType}
                name={`dock-${current}`}
                checked={picked(position)}
                onChange={() => onPick(position)}
              />
              <span className={optionLabelStyle}>{option.label}</span>
              {option.value !== undefined && (
                <span className={optionValueStyle}>{option.value}</span>
              )}
            </label>
          ))}
          <label className={rowStyle} data-selected={answer.ownOn || undefined}>
            <input
              className={boxStyle}
              type={choiceType}
              name={`dock-${current}`}
              checked={answer.ownOn}
              onChange={onOther}
              onClick={() => {
                // A radio fires no change when already chosen; let a second
                // click turn it off again.
                if (!multiple && answer.ownOn) onOther();
              }}
            />
            <span className={optionLabelStyle}>Other</span>
            {other === "inline" ? (
              <input
                className={lineInputStyle}
                aria-label={`${question.label}: other`}
                value={answer.own}
                onChange={(event) => onOwn(event.currentTarget.value)}
              />
            ) : (
              <span className={optionValueStyle}>
                {answer.own.trim() === ""
                  ? "type it in the message box below"
                  : answer.own}
              </span>
            )}
          </label>
        </div>
      )}

      {!typedOnly && form === "buttons" && (
        <>
          <div
            className={buttonsStyle}
            role="group"
            aria-label={question.label}
          >
            {question.options.map((option, position) => (
              <Button
                // biome-ignore lint/suspicious/noArrayIndexKey: an option's place is its identity
                key={position}
                size="sm"
                variant={picked(position) ? "solid" : "subtle"}
                aria-pressed={picked(position)}
                tooltip={option.value}
                onClick={() => onPick(position)}
              >
                {option.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={answer.ownOn ? "solid" : "ghost"}
              aria-pressed={answer.ownOn}
              onClick={onOther}
            >
              Other
            </Button>
          </div>
          {chosenValues.map((value) => (
            <span key={value} className={hintStyle}>
              {value}
            </span>
          ))}
          {answer.ownOn &&
            (other === "inline"
              ? ownField(`${question.label}: other`)
              : composerHint)}
        </>
      )}

      <div className={footerStyle}>
        <span className={hintStyle}>
          {several ? `${answered} of ${questions.length} answered` : ""}
        </span>
        <Button
          size="sm"
          variant="solid"
          disabled={answered === 0}
          onClick={onSend}
        >
          {several ? "Send answers" : "Send answer"}
        </Button>
      </div>
    </section>
  );
};
