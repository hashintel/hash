import { useId, useState } from "react";

import { Button, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  composeAnswers,
  coversTurn,
  fillDraft,
  type OfferedQuestion,
  type OfferedQuestions,
  offersAnswers,
  optionsFor,
  type QuestionAnswer,
  questionKinds,
} from "../../../../conversation/question-kinds";

const cardStyle = css({
  display: "flex",
  flexDirection: "column",
  alignSelf: "flex-start",
  gap: "3",
  maxWidth: "[92%]",
});

const rowStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1.5",
});

const headingStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  fontWeight: "medium",
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

const valuesStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "1.5",
});

/** Whether an answer gives the question any text. */
const isAnswer = (question: OfferedQuestion, answer: QuestionAnswer) =>
  composeAnswers({ questions: [question] }, [answer]) !== undefined;

/**
 * One question's affordances. A `live` row reports every edit as its answer,
 * for the card's one Send; otherwise its fields wait for their own submit.
 */
const QuestionRow = ({
  question,
  heading,
  fieldLabel,
  submitLabel,
  live,
  selected,
  onAnswer,
}: {
  question: OfferedQuestion;
  heading: boolean;
  fieldLabel: string;
  submitLabel: string;
  live: boolean;
  /** The answer shown as chosen, null while there is none; absent when the row shows no selection. */
  selected?: QuestionAnswer | null;
  onAnswer: (answer: QuestionAnswer) => void;
}) => {
  const headingId = useId();
  const [ownWords, setOwnWords] = useState<string | null>(null);
  const [values, setValues] = useState<readonly string[]>([]);
  const ownWordsPath = questionKinds[question.kind].ownWords;
  const toggles = selected !== undefined;
  const ownWordsAnswer: QuestionAnswer = {
    type: "own-words",
    text: ownWords ?? "",
  };
  const valuesAnswer: QuestionAnswer = { type: "values", values: [...values] };

  const ownWordsField = (
    <TextInput
      aria-label={fieldLabel}
      // Opening the field is the person's request to type into it.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
      size="sm"
      width="fullWidth"
      value={ownWords ?? ""}
      onChange={(text) => {
        setOwnWords(text);
        if (live) onAnswer({ type: "own-words", text });
      }}
    />
  );
  const valueFields =
    question.kind === "values" &&
    question.fields.map((field, index) => (
      <TextInput
        // oxlint-disable-next-line react/no-array-index-key -- a field's place is its identity
        key={index}
        aria-label={field.label}
        placeholder={field.label}
        size="sm"
        width="sm"
        suffix={field.unit === undefined ? undefined : { text: field.unit }}
        value={values[index] ?? ""}
        onChange={(value) => {
          const next = question.fields.map((_field, position) =>
            position === index ? value : (values[position] ?? ""),
          );
          setValues(next);
          if (live) onAnswer({ type: "values", values: next });
        }}
      />
    ));

  return (
    <div
      role="group"
      aria-label={heading ? undefined : question.label}
      aria-labelledby={heading ? headingId : undefined}
      className={rowStyle}
    >
      {heading && (
        <span id={headingId} className={headingStyle}>
          {question.label}
        </span>
      )}
      {valueFields &&
        (live ? (
          <div className={valuesStyle}>{valueFields}</div>
        ) : (
          <form
            className={valuesStyle}
            onSubmit={(event) => {
              event.preventDefault();
              onAnswer(valuesAnswer);
            }}
          >
            {valueFields}
            <Button
              type="submit"
              size="sm"
              variant="solid"
              disabled={!isAnswer(question, valuesAnswer)}
            >
              {submitLabel}
            </Button>
          </form>
        ))}
      <div className={optionsStyle}>
        {optionsFor(question).map((option) => (
          <Button
            key={option}
            size="sm"
            variant="subtle"
            aria-pressed={
              toggles
                ? selected?.type === "option" && selected.option === option
                : undefined
            }
            onClick={() => {
              setOwnWords(null);
              onAnswer({ type: "option", option });
            }}
          >
            {option}
          </Button>
        ))}
        {ownWordsPath.path === "field" && (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={ownWords !== null}
            onClick={() => {
              setOwnWords(ownWords ?? "");
              if (live) onAnswer(ownWordsAnswer);
            }}
          >
            {ownWordsPath.label}
          </Button>
        )}
        {ownWordsPath.path === "unknown" && (
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={toggles ? selected?.type === "unknown" : undefined}
            onClick={() => {
              setValues([]);
              onAnswer({ type: "unknown" });
            }}
          >
            {ownWordsPath.label}
          </Button>
        )}
      </div>
      {ownWords !== null &&
        (live ? (
          <div className={ownWordsStyle}>{ownWordsField}</div>
        ) : (
          <form
            className={ownWordsStyle}
            onSubmit={(event) => {
              event.preventDefault();
              onAnswer(ownWordsAnswer);
            }}
          >
            {ownWordsField}
            <Button
              type="submit"
              size="sm"
              variant="solid"
              disabled={!isAnswer(question, ownWordsAnswer)}
            >
              {submitLabel}
            </Button>
          </form>
        ))}
    </div>
  );
};

/**
 * Quick answers beneath the reply that asked. When they cover the turn they
 * are sent as the person's own next message, so they must read as one
 * without the card. When the reply also asks open questions, each answer is
 * written into the composer instead, for the person to finish and send.
 */
export const AnswerOfferCard = ({
  offer,
  onSend,
  onDraft,
}: {
  offer: OfferedQuestions;
  onSend: (text: string) => void;
  /** Rewrites the composer's text; `fill` takes the current text. */
  onDraft: (fill: (draft: string) => string) => void;
}) => {
  const [chosen, setChosen] = useState<readonly (QuestionAnswer | undefined)[]>(
    [],
  );
  if (!offersAnswers(offer)) return null;

  const several = offer.questions.length > 1;
  const drafts = !coversTurn(offer);
  const collects = several && !drafts;
  const choose = (index: number, answer: QuestionAnswer) => {
    if (!several) {
      const text = composeAnswers(offer, [answer]);
      if (text !== undefined) onSend(text);
      return;
    }
    setChosen((current) =>
      offer.questions.map((_question, position) =>
        position === index ? answer : current[position],
      ),
    );
    if (drafts)
      onDraft((draft) =>
        fillDraft(
          draft,
          offer,
          offer.questions.map((_question, position) =>
            position === index ? answer : undefined,
          ),
        ),
      );
  };

  const rows = offer.questions.map(
    (question, index) =>
      question.kind !== "open" && (
        <QuestionRow
          // oxlint-disable-next-line react/no-array-index-key -- a question's place is its identity
          key={index}
          question={question}
          heading={several}
          fieldLabel={several ? question.label : "Your answer"}
          submitLabel={drafts ? "Add to message" : "Send answer"}
          live={collects}
          selected={several ? (chosen[index] ?? null) : undefined}
          onAnswer={(answer) => choose(index, answer)}
        />
      ),
  );
  if (!collects) return <div className={cardStyle}>{rows}</div>;

  const text = composeAnswers(offer, chosen);
  return (
    <form
      className={cardStyle}
      onSubmit={(event) => {
        event.preventDefault();
        if (text !== undefined) onSend(text);
      }}
    >
      {rows}
      <div>
        <Button
          type="submit"
          size="sm"
          variant="solid"
          disabled={text === undefined}
        >
          Send answers
        </Button>
      </div>
    </form>
  );
};
