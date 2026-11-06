/**
 * Which morph parts a step change would carry. A part hidden inside a
 * reveal, or swapped out, carries no name; two shown parts with one name
 * would make the browser refuse the transition, so the deck warns and steps
 * without one.
 */

/** Names that occur more than once. */
export const repeatedNames = (names: readonly string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      repeated.add(name);
    }
    seen.add(name);
  }
  return [...repeated];
};

/** The names of the morph parts drawn on the current slide. */
export const shownMorphNames = (root: ParentNode): string[] =>
  [...root.querySelectorAll<HTMLElement>(".deck-canvas .deck-morph")]
    .filter(
      (part) =>
        part.getClientRects().length > 0 &&
        getComputedStyle(part).viewTransitionName !== "none",
    )
    .map((part) => part.dataset.morph ?? "");

/**
 * Whether a step change on the current slide should morph: it has parts to
 * move, and no name is shown twice.
 */
export const slideMorphs = (root: ParentNode): boolean => {
  const names = shownMorphNames(root);
  const repeated = repeatedNames(names);
  if (repeated.length > 0) {
    // oxlint-disable-next-line no-console -- the deck still steps; this is how its author learns why nothing glides
    console.warn(
      `morph names shown twice on this slide, so its steps do not morph: ${repeated.join(", ")}`,
    );
    return false;
  }
  return names.length > 0;
};
