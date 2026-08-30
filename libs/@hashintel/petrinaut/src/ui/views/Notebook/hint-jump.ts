/**
 * Hint-jump labelling: Vimium/avy-style two-keystroke navigation. Pressing
 * the trigger key labels every visible row with a short letter sequence;
 * typing a label jumps to its row.
 */

/** Home-row-first alphabet, so the common labels stay under the fingers. */
const HINT_LETTERS = "asdfghjkl".split("");

/**
 * A label per target, all the same length so no label is a prefix of
 * another: single letters while they suffice, letter pairs beyond that.
 */
export function hintLabels(count: number): string[] {
  if (count <= HINT_LETTERS.length) {
    return HINT_LETTERS.slice(0, count);
  }
  const labels: string[] = [];
  for (const first of HINT_LETTERS) {
    for (const second of HINT_LETTERS) {
      labels.push(`${first}${second}`);
      if (labels.length === count) {
        return labels;
      }
    }
  }
  return labels;
}

export type HintMatch =
  | { kind: "pending" }
  | { kind: "match"; index: number }
  | { kind: "none" };

/** How typed characters resolve against the labels of `hintLabels(count)`. */
export function matchHint(typed: string, count: number): HintMatch {
  const labels = hintLabels(count);
  const index = labels.indexOf(typed);
  if (index !== -1) {
    return { kind: "match", index };
  }
  return labels.some((label) => label.startsWith(typed))
    ? { kind: "pending" }
    : { kind: "none" };
}
