import { optionText } from "./kinds";

import type { OfferedOption, OfferedQuestions } from "./kinds";

const firstLine = (text: string) => text.split("\n", 1)[0] ?? "";

/**
 * The option an answer's text picks: the one its first line states. Whatever
 * follows that line is the person's own addition.
 */
export const pickedOption = (
  text: string,
  options: readonly OfferedOption[],
): OfferedOption | undefined => {
  const line = firstLine(text).trim();
  return options.find((option) => optionText(option) === line);
};

/**
 * An answer's text once `option` is picked. It takes the place of the option
 * picked before; text the person typed themselves stays, beneath it.
 */
export const pickOption = (
  text: string,
  options: readonly OfferedOption[],
  option: OfferedOption,
): string => {
  const own = pickedOption(text, options)
    ? text.slice(firstLine(text).length + 1)
    : text;
  return own.trim() === ""
    ? optionText(option)
    : `${optionText(option)}\n${own}`;
};

/**
 * What the person sends for the answers given so far, by question position.
 * It must read correctly on its own: the Ledger and Voice see only this text.
 * Undefined until something is answered.
 */
export const composeAnswers = (
  { questions }: OfferedQuestions,
  answers: readonly (string | undefined)[],
): string | undefined => {
  const texts = questions.map((_question, index) => {
    const text = answers[index]?.trim();
    return text === "" ? undefined : text;
  });
  if (texts.every((text) => text === undefined)) return undefined;
  if (texts.length === 1) return texts[0];

  const lines = questions.flatMap(({ label }, index) => {
    const text = texts[index];
    return text === undefined ? [] : [`${index + 1}. ${label}: ${text}`];
  });
  const unanswered = questions
    .filter((_question, index) => texts[index] === undefined)
    .map(({ label }) => label);
  return unanswered.length > 0
    ? `${lines.join("\n")}\n\nNot answered yet: ${unanswered.join(", ")}.`
    : lines.join("\n");
};
