/**
 * PROTOTYPE (FE-1594 review, throwaway): the quick-answer card with no text
 * fields of its own. The free-text choice ("Something else…", "Not quite…")
 * and a values question both send the person to the composer, with a line
 * written there for them to finish. Choosing free text disables that
 * question's option buttons.
 *
 * A card sends by itself only while every answer is a click. Once anything is
 * to be typed, every answer goes into the composer and is sent from there.
 */
import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  composeAnswers,
  coversTurn,
  type OfferedQuestion,
  type OfferedQuestions,
  optionsFor,
  type QuestionAnswer,
  questionKinds,
} from "../../../../libs/@hashintel/brunch-agent/src/conversation/question-kinds";

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  alignSelf: "flex-start",
  gap: "3",
  maxWidth: "[92%]",
});
const rowStyle = css({ display: "flex", flexDirection: "column", gap: "1.5" });
const headingStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
});
const optionsStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5" });
const hintStyle = css({ color: "neutral.s80", fontSize: "xs" });

/** A question's answer here: a clicked option, "I don't know", or typed in the composer. */
type Choice =
  | { type: "option"; option: string }
  | { type: "unknown" }
  | { type: "typed" };

export type ComposerEdit = (draft: string) => { text: string; caret: number };

const typedLabel = (question: OfferedQuestion) => {
  const { ownWords } = questionKinds[question.kind];
  return ownWords.path === "field" ? ownWords.label : "Enter values…";
};

/** What the composer line holds for a question the person will type. */
const typedStart = (question: OfferedQuestion) => {
  if (question.kind === "values")
    return question.fields
      .map(({ label, unit }) =>
        unit === undefined ? `${label}: ` : `${label}:  ${unit}`,
      )
      .join("; ");
  const { ownWords } = questionKinds[question.kind];
  return ownWords.path === "field" ? ownWords.prefix : "";
};

/** Where the caret goes in `typedStart`: after the prefix, or in the first value. */
const typedCaret = (question: OfferedQuestion) => {
  if (question.kind !== "values") return typedStart(question).length;
  const first = question.fields[0];
  return first ? `${first.label}: `.length : 0;
};

const lineText = (question: OfferedQuestion, choice: Choice | undefined) => {
  if (choice === undefined) return undefined;
  if (choice.type === "typed") return typedStart(question);
  if (choice.type === "unknown") return "I don't know.";
  return choice.option;
};

const head = (question: OfferedQuestion, index: number) =>
  `${index + 1}. ${question.label}:`;

/** The composer after these choices are written in, with the caret on `focus`'s line. */
const writeLines = (
  draft: string,
  offer: OfferedQuestions,
  choices: readonly (Choice | undefined)[],
  focus: number,
): { text: string; caret: number } => {
  const lines = draft.trim() === "" ? [] : draft.split("\n");
  const blank = lines.length === 0;
  for (const [index, question] of offer.questions.entries()) {
    const text = lineText(question, choices[index]);
    if (text === undefined && !blank) continue;
    const line = `${head(question, index)} ${text ?? ""}`;
    const at = lines.findIndex((existing) =>
      existing.startsWith(head(question, index)),
    );
    if (at === -1) lines.push(line);
    // A line the person has typed on is left as they wrote it.
    else if (choices[index]?.type !== "typed" || index === focus)
      lines[at] = line;
  }
  // After a click, the caret goes to the first line still waiting for text;
  // after a free-text choice, into that question's line.
  const isTyped = choices[focus]?.type === "typed";
  const target = isTyped
    ? focus
    : offer.questions.findIndex(
        (question, index) => lineText(question, choices[index]) === undefined,
      );
  const targeted = offer.questions[target];
  const at = targeted
    ? lines.findIndex((line) => line.startsWith(head(targeted, target)))
    : -1;
  const lineStart =
    lines.slice(0, Math.max(at, 0)).join("\n").length + (at > 0 ? 1 : 0);
  const caret =
    targeted && at !== -1
      ? isTyped
        ? lineStart + head(targeted, target).length + 1 + typedCaret(targeted)
        : lineStart + (lines[at]?.length ?? 0)
      : lines.join("\n").length;
  return { text: lines.join("\n"), caret };
};

const toAnswer = (choice: Choice | undefined): QuestionAnswer | undefined =>
  choice === undefined || choice.type === "typed" ? undefined : choice;

export const PrototypeComposerCard = ({
  offer,
  onSend,
  onCompose,
}: {
  offer: OfferedQuestions;
  onSend: (text: string) => void;
  onCompose: (edit: ComposerEdit, note: string) => void;
}) => {
  const [choices, setChoices] = useState<readonly (Choice | undefined)[]>([]);
  const several = offer.questions.length > 1;
  const typing = (current: readonly (Choice | undefined)[]) =>
    !coversTurn(offer) || current.some((choice) => choice?.type === "typed");

  const choose = (index: number, choice: Choice | undefined) => {
    const question = offer.questions[index];
    if (!question) return;
    const next = offer.questions.map((_question, position) =>
      position === index ? choice : choices[position],
    );
    setChoices(next);

    if (!several) {
      if (choice?.type === "typed")
        onCompose(
          (draft) => {
            const opening = `${question.label} (${typedLabel(question)
              .replace("…", "")
              .toLowerCase()}):\n\n${typedStart(question)}`;
            const text =
              draft.trim() === "" ? opening : `${draft}\n\n${opening}`;
            return {
              text,
              caret:
                text.length -
                typedStart(question).length +
                typedCaret(question),
            };
          },
          `"${typedLabel(question)}" moved the cursor to the composer`,
        );
      else if (choice !== undefined) {
        const text = composeAnswers(offer, [toAnswer(choice)]);
        if (text !== undefined) onSend(text);
      }
      return;
    }
    if (typing(next))
      onCompose(
        (draft) => writeLines(draft, offer, next, index),
        choice?.type === "typed"
          ? `"${typedLabel(question)}" on "${question.label}": every answer now goes through the composer`
          : `Answer to "${question.label}" written into the composer`,
      );
  };

  const typed = typing(choices);
  const text = typed ? undefined : composeAnswers(offer, choices.map(toAnswer));

  return (
    <div className={cardStyle} data-prototype-card>
      {offer.questions.map((question, index) => {
        if (question.kind === "open") return null;
        const choice = choices[index];
        const isTyped = choice?.type === "typed";
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: a question's place is its identity
            key={index}
            role="group"
            aria-label={question.label}
            className={rowStyle}
          >
            <span className={headingStyle}>{question.label}</span>
            <div className={optionsStyle}>
              {optionsFor(question).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant="subtle"
                  disabled={isTyped}
                  aria-pressed={
                    several
                      ? choice?.type === "option" && choice.option === option
                      : undefined
                  }
                  onClick={() => choose(index, { type: "option", option })}
                >
                  {option}
                </Button>
              ))}
              {question.kind === "values" && (
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={isTyped}
                  aria-pressed={
                    several ? choice?.type === "unknown" : undefined
                  }
                  onClick={() => choose(index, { type: "unknown" })}
                >
                  I don't know
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-pressed={isTyped}
                onClick={() =>
                  choose(index, isTyped ? undefined : { type: "typed" })
                }
              >
                {typedLabel(question)}
              </Button>
            </div>
            {isTyped && (
              <span className={hintStyle}>
                Type your answer in the message box below.
              </span>
            )}
          </div>
        );
      })}
      {several &&
        (typed ? (
          <span className={hintStyle}>
            Finish and send from the message box below.
          </span>
        ) : (
          <div>
            <Button
              size="sm"
              variant="solid"
              disabled={text === undefined}
              onClick={() => {
                if (text !== undefined) onSend(text);
              }}
            >
              Send answers
            </Button>
          </div>
        ))}
    </div>
  );
};
