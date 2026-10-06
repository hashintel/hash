import { css } from "@hashintel/ds-helpers/css";

/**
 * Levels the sort menu's xs trigger with the filter bar's 28.4px pills and
 * chips (see `header/pill-styles.ts`): the xs button is 12px font × 1.6
 * line-height + 2 × 1px border = 21.2px, so 3.6px of vertical padding makes
 * up the difference. The doubled `&&` outranks the button recipe's
 * equal-boost paddingY atom (the @layer polyfill's specificity boost, which
 * `sx` cannot outrank).
 */
export const sortMenuTriggerChrome = css({
  "&&": {
    paddingY: "[3.6px]",
  },
});
