/**
 * The classes that step a part of a drawing on a slide, whether d2 drew it
 * or the deck did. Two kinds:
 *
 * - states, which hold from their step on: `at-<n>` shows the part,
 *   `until-<n>` hides it again, `draw-<n>` shows it by drawing its lines
 *   from start to end;
 * - events, which happen on their step alone: `flow-<n>` runs dashes along
 *   its lines, `focus-<n>` fades the rest of the drawing, `token-<n>` sends
 *   a token along its line from start to end.
 */

export const stepKinds = ["at", "until", "draw", "flow", "focus", "token"];

/** One class name: the kind and the step. */
export const stepClass = /^(at|until|draw|flow|focus|token)-(\d+)$/u;

/** Every step class in a stretch of source text, its step in group 1. */
export const stepClassInText = /\b(?:at|until|draw|flow|focus|token)-(\d+)\b/gu;
