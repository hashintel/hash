/**
 * figma-ds `_IconState` (`WmnosvOvi4Blw0HK0jh1mG` 38569:72338) for the round icon in a DS Dialog header: a 24 px disc
 * with a filled 16 px glyph in the state colour. Pass one of these as `Dialog.Header`'s `className`.
 *
 * The code DS draws the header icon as a neutral line glyph, and the prototype's thin-icon pack makes that a 1.25 px
 * Lucide outline, so a coloured state reads as a faint outline. These fill the glyph's body in the state colour and
 * draw its mark (the "!" or "i") in the disc colour, as the figma-ds glyphs do.
 *
 * figma-ds value → closest code-ds token (disc · glyph):
 * - neutral: #ededed → neutral.s35 · #a3a3a3 → neutral.s85
 * - danger: #fee2e2 → red.s35 · #ef4444 → red.s90
 * - warning: #ffe9cc → orange.s35 · #f97316 → orange.s90
 */
import { css } from "@hashintel/ds-helpers/css";

const icon = "& > div > svg:first-child";
const body = `${icon} > :first-child`;
const mark = `${icon} > :not(:first-child)`;

export const iconStateNeutral = css({
  [icon]: { backgroundColor: "neutral.s35", color: "neutral.s85" },
  [body]: { fill: "currentColor" },
  [mark]: { stroke: "neutral.s35", strokeWidth: "[1.5px]" },
});

export const iconStateDanger = css({
  [icon]: { backgroundColor: "red.s35", color: "red.s90" },
  [body]: { fill: "currentColor" },
  [mark]: { stroke: "red.s35", strokeWidth: "[1.5px]" },
});

export const iconStateWarning = css({
  [icon]: { backgroundColor: "orange.s35", color: "orange.s90" },
  [body]: { fill: "currentColor" },
  [mark]: { stroke: "orange.s35", strokeWidth: "[1.5px]" },
});
