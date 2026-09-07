import { css, cva } from "@hashintel/ds-helpers/css";

import type { SystemStyleObject } from "@hashintel/ds-helpers/types";

export const srOnly = css.raw({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  overflow: "clip",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} as const satisfies SystemStyleObject);

/**
 * Thin (8px) variant of the preset's scrollbar styling, for dense scroll
 * containers (dropdown lists, textareas). WebKit engines get a narrower
 * custom gutter; engines that only style scrollbars through the standard
 * properties get `scrollbar-width: thin` instead. The gate keeps that
 * declaration away from Chromium and Safari, where a computed
 * `scrollbar-width` other than `auto` would disable the preset's
 * `::-webkit-scrollbar-*` styling entirely.
 */
export const thinScrollbar = {
  "&::-webkit-scrollbar": {
    width: "[8px]",
    height: "[8px]",
  },
  // Must stay a literal: Panda's static extraction drops computed keys. The
  // string duplicates `standardScrollbarPropertiesGate` in
  // `../preset/scrollbars` (see there for why it is shaped this way) and must
  // be kept in step with it.
  "@supports (-moz-appearance: none) or ((not selector(::-webkit-scrollbar)) and (scrollbar-width: thin))":
    {
      scrollbarWidth: "[thin]",
    },
} as const satisfies SystemStyleObject;

// Do not use this export! We only need to export this as a recipe for panda
// to be able to properly analyze and share styles (recipes that spread
// `thinScrollbar` only produce the atomic class names; this emits the rules).
export const thinScrollbarRecipe = cva({ base: thinScrollbar });
