import { css } from "@hashintel/ds-helpers/css";

/**
 * White rows with tighter vertical padding than the ds card default.
 * Authored as Panda `css()` (file is in panda.config's `include`), as sx
 * cannot outspecify panda styles; `> li` outspecifies the recipe's rules.
 */
export const reorderableListChrome = css({
  "& > li": {
    backgroundColor: "white",
    paddingY: "1",
  },
});
