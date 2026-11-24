import { useId } from "react";

import { css } from "@hashintel/ds-helpers/css";

import {
  type OfferedQuestion,
  optionsFor,
} from "../../../../conversation/question-kinds";
import { currentOffer } from "./answer-dock";

import type { PetrinautAiMessage } from "../types";

// Shrinks and scrolls before the transcript gives up more than half the
// panel, so the Voice controls below it stay on screen however many
// questions there are.
const sectionStyle = css({
  flex: "[0 1 auto]",
  minHeight: "[0]",
  maxHeight: "[50%]",
  overflowY: "auto",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderTop: "[1px solid {colors.neutral.bd.subtle}]",
  backgroundColor: "neutral.s00",
});

const titleStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
});

const questionsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2.5",
  margin: "[0]",
  paddingLeft: "[0]",
  listStyle: "none",
});

const labelStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
});

const textStyle = css({
  color: "neutral.s120",
  fontSize: "sm",
  lineHeight: "[1.45]",
});

const answersStyle = css({
  margin: "[0]",
  paddingLeft: "4",
  listStyle: "disc",
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "[1.45]",
});

/** What a question offers to answer with: its options, or the values it asks for. */
const answersFor = (question: OfferedQuestion): string[] =>
  question.kind === "values"
    ? question.fields.map(({ label, unit }) =>
        unit === undefined ? label : `${label} (${unit})`,
      )
    : optionsFor(question).map(({ label, value }) =>
        value === undefined ? label : `${label}: ${value}`,
      );

/**
 * The questions the latest reply asks, read-only for a Voice user: every one
 * in order, with each option or requested value in full. They are answered
 * aloud, so nothing here can be clicked or typed into.
 */
export const VoiceQuestions = ({
  messages,
}: {
  messages: readonly PetrinautAiMessage[];
}) => {
  const titleId = useId();
  const found = currentOffer(messages);
  if (found === undefined) return null;

  return (
    <section
      className={sectionStyle}
      aria-labelledby={titleId}
      data-question-count={found.offer.questions.length}
    >
      <h2 id={titleId} className={titleStyle}>
        Questions to answer aloud
      </h2>
      <ol className={questionsStyle}>
        {found.offer.questions.map((question) => {
          const answers = answersFor(question);
          return (
            <li key={question.label}>
              <h3 className={labelStyle}>{question.label}</h3>
              <p className={textStyle}>{question.text}</p>
              {answers.length > 0 && (
                <ul className={answersStyle}>
                  {answers.map((answer) => (
                    <li key={answer}>{answer}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
};
