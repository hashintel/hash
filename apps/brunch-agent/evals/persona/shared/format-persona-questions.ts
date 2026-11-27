import type { PersonaQuestion } from "../rpc-protocol.ts";

/** Live, a question also says how to answer it; asked, it only records it. */
const describeQuestion = (
  question: PersonaQuestion,
  index: number,
  live: boolean,
) => {
  const head = `${index + 1}. ${question.label}: ${question.text}`;
  if (question.options?.length)
    return [
      head,
      ...(live
        ? ["   Pick one by its label, or answer in your own words:"]
        : []),
      ...question.options.map(({ label, value }) =>
        value === undefined ? `   - ${label}` : `   - ${label}: ${value}`,
      ),
    ].join("\n");
  if (question.fields?.length)
    return `${head}\n   ${live ? "Give" : "Fields"}: ${question.fields
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
    ...questions.map((question, index) =>
      describeQuestion(question, index, true),
    ),
  ].join("\n");

/** What an earlier turn docked, as a record without answering instructions. */
export const formatAskedQuestions = (questions: readonly PersonaQuestion[]) =>
  [
    "Brunch asked:",
    ...questions.map((question, index) =>
      describeQuestion(question, index, false),
    ),
  ].join("\n");
