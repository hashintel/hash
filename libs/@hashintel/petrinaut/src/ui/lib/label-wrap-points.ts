/**
 * Inserts zero width spaces at a label's word boundaries, so a long name
 * wraps inside a node instead of overflowing it.
 *
 * Boundaries are the PascalCase ones a browser will not break on its own: the
 * start of a capitalised word, the start of a word after an acronym, and the
 * start of a run of digits. Every other character is left as it is, so a label
 * written as a sentence comes back untouched.
 *
 * "CriticalOxygenTank" wraps as Critical / Oxygen / Tank, "XMLHttpRequest" as
 * XML / Http / Request, "Space42" as Space / 42.
 */
const WORD_BOUNDARY =
  /(?<=[\p{Ll}\d])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})|(?<=\p{L})(?=\d)/gu;

export const withLabelWrapPoints = (label: string): string =>
  label.replace(WORD_BOUNDARY, "\u200B");
