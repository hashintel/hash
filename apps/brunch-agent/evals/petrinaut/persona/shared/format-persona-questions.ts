import type { PersonaQuestion } from "../rpc-protocol.ts";

const describeQuestion = (question: PersonaQuestion, index: number) => {
  const head = `${index + 1}. ${question.label}: ${question.text}`;
  if (question.options?.length)
    return [
      head,
      "   Pick one by its label, or answer in your own words:",
      ...question.options.map(({ label, value }) =>
        value === undefined ? `   - ${label}` : `   - ${label}: ${value}`,
      ),
    ].join("\n");
  if (question.fields?.length)
    return `${head}\n   Give: ${question.fields
      .map(({ label, unit }) =>
        unit === undefined ? label : `${label} (${unit})`,
      )
      .join(", ")}`;
  return head;
};

/** What the panel docks on the composer, as the persona needs to answer it. */
export const formatPersonaQuestions = (questions: readonly PersonaQuestion[]) =>
  [
    questions.length === 1
      ? 'Brunch asks this on its message box. Reply with `say`, or pick an option with `answer "<its label>"`:'
      : `Brunch asks ${questions.length} questions on its message box. Answer them together with \`answer\`, one quoted argument each in this order, "" to skip one:`,
    ...questions.map(describeQuestion),
  ].join("\n");
