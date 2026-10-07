import { css } from "@hashintel/ds-helpers/css";

/**
 * Levels the sort menu's xs trigger with the filter bar's 28.4px pills and chips (see `header/pill-styles.ts`)
 * Authored as Panda `css()` (file is in panda.config's `include`), as sx cannot outspecify panda styles
 */
export const sortMenuTriggerChrome = css({
  "&&": {
    paddingY: "[3.6px]",
  },
});
