import { css } from "@hashintel/ds-helpers/css";

/**
 * Matches the ds `Filter` chips' chrome to the MUI web/type pills beside
 * them: the pills' gray[5] fill and their static gray[30] border (the chip's
 * own resting border is darker and darkens further on hover; the pills'
 * never changes). Hex because the MUI grays have no ds-token equivalents.
 *
 * Authored as Panda `css()` (file is in panda.config's `include`): the
 * chip recipe's declarations carry the @layer polyfill's specificity boost,
 * which `sx` cannot outrank — the doubled `&&` beats the recipe's
 * equal-boost atoms, and the tripled hover/focus keys beat its state
 * re-declarations.
 */
export const filterChipPillChrome = css({
  "&&": {
    // palette.gray[5]
    background: "[#F9FBFC]",
    // palette.gray[30]
    "--filter-outer-border": "#DDE7F0",
  },
  "&&:hover": {
    "--filter-outer-border": "#DDE7F0",
  },
  "&&:focus-within": {
    "--filter-outer-border": "#DDE7F0",
  },
});

/**
 * The English reading of a symbolic operator ("greater than" beside ">"),
 * part of the operator's `renderItem` dropdown row (its `renderSelectedItem`
 * keeps the chip to the bare symbol). Inline flow keeps it baseline-aligned.
 */
export const operatorDescriptionClass = css({
  color: "fg.subtle",
  fontSize: "[0.85em]",
  marginLeft: "1.5",
});
