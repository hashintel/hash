/** One value a `values` question asks the person to supply. */
export type ValueField = { label: string; unit?: string };

/**
 * An answer offered as a button: `label` names it there, and `value` is the
 * answer in full where the label is only its name.
 */
export type OfferedOption = { label: string; value?: string };

/**
 * A question a turn asks: a short name, the question as asked, and the kind
 * that decides which answers the dock on the composer offers. The reply
 * itself only leads into the questions, so `text` is the one place each is
 * asked. The wire schema is checked against
 * this type.
 */
export type OfferedQuestion =
  | { kind: "confirm"; label: string; text: string }
  | { kind: "choose"; label: string; text: string; options: OfferedOption[] }
  | { kind: "values"; label: string; text: string; fields: ValueField[] }
  | { kind: "open"; label: string; text: string };

/** Every question one turn asks, in order. */
export type OfferedQuestions = { questions: OfferedQuestion[] };

export type QuestionKind = OfferedQuestion["kind"];

const optionBounds = { min: 2, max: 4, maxLabelLength: 32 };

/**
 * What each kind offers and its bounds. Whatever the kind, the person can
 * answer in their own words in the composer. When to use each is the
 * agent's guidance, not this module's.
 */
export const questionKinds = {
  confirm: {
    answers: [{ label: "Yes" }],
  },
  choose: {
    bounds: optionBounds,
  },
  values: {
    bounds: { min: 1, max: 3, maxLabelLength: 32, maxUnitLength: 16 },
  },
  open: {},
} as const satisfies Record<
  QuestionKind,
  {
    answers?: readonly OfferedOption[];
    bounds?: Readonly<Record<string, number>>;
  }
>;

/** Bounds every offer keeps, whatever its questions' kinds. */
export const offerBounds = {
  questions: { min: 1, max: 4 },
  maxLabelLength: 48,
};

/** What each part of an offer means, for whoever writes one. */
export const offerText = {
  questions:
    "Every question this turn asks, in the order to answer them, including the open ones.",
  label:
    'A short name for the question, such as "Quarantined shipment". It heads the question on screen and its answer in the sent text; for an open question, name what to write, such as "Recent order, start to finish".',
  text: 'The question itself, in full, as you would ask it aloud, such as "When a shipment is quarantined, how is it counted until quality releases it?". The user reads it here and nowhere else. Don\'t list the options in it.',
  options:
    'The alternatives, one button each. The user can always type their own answer instead, so offer no "other" or "something else" option.',
  optionLabel:
    'A few words naming the alternative on its button, such as "Stays open".',
  optionValue:
    'The alternative in full, as a complete sentence the user could send as their answer, such as "It stays counted as an open purchase order". It shows when the user points at the button and becomes their answer. Leave it out when the label already is the answer.',
  fields: "The values the user supplies, one field each.",
  fieldLabel: 'What the value is, such as "Lower reorder point".',
  unit: 'The value\'s unit, such as "units" or "days".',
};

/**
 * A question as it is said aloud, where no dock shows its options: the
 * question, then each alternative in full.
 */
export const spokenQuestion = (question: OfferedQuestion) =>
  question.kind === "choose"
    ? `${question.text} ${question.options.map(optionText).join("; ")}.`
    : question.text;

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

/** What identifies a question, or an option within one: its label, as read. */
export const labelKey = (label: string) => label.trim().toLowerCase();

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
      latest.set(labelKey(question.label), question);
  return { questions: [...latest.values()] };
};
