import {
  type OfferedQuestion,
  type OfferedQuestions,
  questionKinds,
} from "./kinds";

/** One question's answer: an offered option, the person's own words, the values they supply, or "I don't know". */
export type QuestionAnswer =
  | { type: "option"; option: string }
  | { type: "own-words"; text: string }
  | { type: "values"; values: string[] }
  | { type: "unknown" };

/**
 * Whether the card answers the whole turn, so its answers are sent as they
 * stand. Otherwise they are drafted into the composer for the person to finish.
 */
export const coversTurn = ({ questions }: OfferedQuestions) =>
  questions.every(({ kind }) => kind !== "open");

const answerText = (
  question: OfferedQuestion,
  answer: QuestionAnswer,
): string | undefined => {
  const { ownWords } = questionKinds[question.kind];
  switch (answer.type) {
    case "option":
      return answer.option;
    case "own-words": {
      const text = answer.text.trim();
      if (!text) return undefined;
      return ownWords.path === "field" ? `${ownWords.prefix}${text}` : text;
    }
    case "values": {
      if (question.kind !== "values") return undefined;
      const supplied = question.fields.flatMap((field, index) => {
        const value = answer.values[index]?.trim();
        if (!value) return [];
        return [
          field.unit === undefined
            ? `${field.label}: ${value}`
            : `${field.label}: ${value} ${field.unit}`,
        ];
      });
      return supplied.length > 0 ? supplied.join("; ") : undefined;
    }
    case "unknown":
      return ownWords.path === "unknown" ? ownWords.text : undefined;
  }
};

/**
 * What the person sends, or the draft they finish in the composer, for the
 * answers given so far, by question position. It must read correctly on its
 * own: the Ledger and Voice see only this text. Undefined until something is
 * answered.
 */
export const composeAnswers = (
  offer: OfferedQuestions,
  answers: readonly (QuestionAnswer | undefined)[],
): string | undefined => {
  const texts = offer.questions.map((question, index) => {
    const answer = answers[index];
    return answer === undefined ? undefined : answerText(question, answer);
  });
  if (texts.every((text) => text === undefined)) return undefined;
  if (texts.length === 1) return texts[0];

  const covered = coversTurn(offer);
  const lines = offer.questions.flatMap(({ label }, index) => {
    const text = texts[index];
    if (text !== undefined) return [`${index + 1}. ${label}: ${text}`];
    return covered ? [] : [`${index + 1}. ${label}:`];
  });
  const unanswered = offer.questions
    .filter((_question, index) => texts[index] === undefined)
    .map(({ label }) => label);
  return covered && unanswered.length > 0
    ? `${lines.join("\n")}\n\nNot answered yet: ${unanswered.join(", ")}.`
    : lines.join("\n");
};
