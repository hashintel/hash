/** One value a `values` question asks the person to supply. */
export type ValueField = { label: string; unit?: string };

/**
 * An answer offered as a button: `label` names it there, and `value` is the
 * answer in full where the label is only its name.
 */
export type OfferedOption = { label: string; value?: string };

/**
 * A question one reply asks, with the kind that decides which answers the
 * dock on the composer offers. The wire schema is checked against this type.
 */
export type OfferedQuestion =
  | { kind: "confirm"; label: string }
  | { kind: "choose"; label: string; options: OfferedOption[] }
  | { kind: "values"; label: string; fields: ValueField[] }
  | { kind: "open"; label: string };

/** Every question one reply asks, in the reply's order. */
export type OfferedQuestions = { questions: OfferedQuestion[] };

export type QuestionKind = OfferedQuestion["kind"];

const optionBounds = { min: 2, max: 4, maxLabelLength: 32 };

/**
 * What makes a question each kind, and its bounds. `use` completes
 * "Use <kind> …" in the model's instructions. Whatever the kind, the person
 * can answer in their own words in the composer.
 */
export const questionKinds = {
  confirm: {
    use: "when you restate something for the user to confirm",
    answers: [{ label: "Yes" }],
  },
  choose: {
    use: `for ${optionBounds.min} to ${optionBounds.max} named alternatives such as readings of the user's own words`,
    bounds: optionBounds,
  },
  values: {
    use: "for numbers the user supplies",
    bounds: { min: 1, max: 3, maxLabelLength: 32, maxUnitLength: 16 },
  },
  open: {
    use: "for every other question",
  },
} as const satisfies Record<
  QuestionKind,
  {
    use: string;
    answers?: readonly OfferedOption[];
    bounds?: Readonly<Record<string, number>>;
  }
>;

/** Bounds every offer keeps, whatever its questions' kinds. */
export const offerBounds = {
  questions: { min: 1, max: 4 },
  maxLabelLength: 48,
};

/**
 * Questions that never get offered answers, whatever their form: a menu
 * would put guesses in the person's mouth, or break up their account.
 */
export const neverOffer = [
  "a question about the user's purpose: what they want the model to help them decide, answer or achieve",
  "an open or narrative question",
] as const;

/** What each part of an offer means, for whoever writes one. */
export const offerText = {
  questions:
    "Every question your reply asks, in the reply's order, including the open ones.",
  label:
    'A short name for the question, such as "Quarantined shipment". It heads the question\'s answer on screen and in the sent text; for an open question, name what to write, such as "Recent order, start to finish".',
  options: "The alternatives, one button each.",
  optionLabel:
    'A few words naming the alternative on its button, such as "Stays open".',
  optionValue:
    'The alternative in full, worded as the user would answer, such as "It stays counted as an open purchase order". It shows when the user points at the button and becomes their answer. Leave it out when the label already is the answer.',
  fields: "The values the user supplies, one field each.",
  fieldLabel: 'What the value is, such as "Lower reorder point".',
  unit: 'The value\'s unit, such as "units" or "days".',
};

/** The answers a question offers as buttons. */
export const optionsFor = (
  question: OfferedQuestion,
): readonly OfferedOption[] => {
  switch (question.kind) {
    case "confirm":
      return questionKinds.confirm.answers;
    case "choose":
      return question.options;
    case "values":
    case "open":
      return [];
  }
};

/** The answer a click on an option gives. */
export const optionText = ({ label, value }: OfferedOption) => value ?? label;

/** Whether an offer offers anything: at least one question isn't open. */
export const offersAnswers = ({ questions }: OfferedQuestions) =>
  questions.some(({ kind }) => kind !== "open");

/**
 * One turn's offers as the one set of questions the person answers. A
 * question is known by its label: one offered again keeps the place it was
 * first offered and takes its latest offer's content.
 */
export const mergeOffers = (
  offers: readonly OfferedQuestions[],
): OfferedQuestions => {
  // Setting a key a Map already holds keeps the key's original position.
  const latest = new Map<string, OfferedQuestion>();
  for (const { questions } of offers)
    for (const question of questions)
      latest.set(question.label.trim().toLowerCase(), question);
  return { questions: [...latest.values()] };
};
