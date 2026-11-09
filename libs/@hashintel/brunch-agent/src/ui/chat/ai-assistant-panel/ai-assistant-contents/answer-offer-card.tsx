import { useState } from "react";

import { Button, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  composeAnswers,
  coversTurn,
  type QuestionAnswer,
} from "../../../../conversation/question-kinds/answers";
import {
  type OfferedQuestions,
  optionsFor,
  questionKinds,
} from "../../../../conversation/question-kinds/kinds";

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  alignSelf: "flex-start",
  gap: "1.5",
  maxWidth: "[92%]",
});

const optionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "1.5",
});

const ownWordsStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
});

/**
 * Quick answers beneath the reply that asked. Each one is sent as the
 * person's own next message, so it must read as one without the card.
 */
export const AnswerOfferCard = ({
  offer,
  onSend,
}: {
  offer: OfferedQuestions;
  onSend: (text: string) => void;
}) => {
  const [ownWords, setOwnWords] = useState<string | null>(null);
  const [question, ...others] = offer.questions;
  if (question === undefined) return null;
  const ownWordsPath = questionKinds[question.kind].ownWords;
  // Until the card can draft into the composer, it shows only for a single
  // question whose answer is sent as it stands.
  if (others.length > 0 || !coversTurn(offer) || ownWordsPath.path !== "field")
    return null;

  const textFor = (answer: QuestionAnswer) => composeAnswers(offer, [answer]);
  const send = (answer: QuestionAnswer) => {
    const text = textFor(answer);
    if (text !== undefined) onSend(text);
  };
  const ownWordsAnswer: QuestionAnswer = {
    type: "own-words",
    text: ownWords ?? "",
  };

  return (
    <div role="group" aria-label={question.label} className={cardStyle}>
      <div className={optionsStyle}>
        {optionsFor(question).map((option) => (
          <Button
            key={option}
            size="sm"
            variant="subtle"
            onClick={() => send({ type: "option", option })}
          >
            {option}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={ownWords !== null}
          onClick={() => setOwnWords((current) => current ?? "")}
        >
          {ownWordsPath.label}
        </Button>
      </div>
      {ownWords !== null && (
        <form
          className={ownWordsStyle}
          onSubmit={(event) => {
            event.preventDefault();
            send(ownWordsAnswer);
          }}
        >
          <TextInput
            aria-label="Your answer"
            // Opening the field is the person's request to type into it.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            size="sm"
            width="fullWidth"
            value={ownWords}
            onChange={setOwnWords}
          />
          <Button
            type="submit"
            size="sm"
            variant="solid"
            disabled={textFor(ownWordsAnswer) === undefined}
          >
            Send answer
          </Button>
        </form>
      )}
    </div>
  );
};
