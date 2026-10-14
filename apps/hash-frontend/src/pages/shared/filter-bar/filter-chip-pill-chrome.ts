import { css } from "@hashintel/ds-helpers/css";

/**
 * Matches the ds `Filter` chips' chrome to the MUI web/type pills beside them
 * Authored as Panda `css()` (file is in panda.config's `include`), as sx cannot outspecify panda styles
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

export const operatorDescriptionClass = css({
  color: "fg.subtle",
  fontSize: "[0.85em]",
  marginLeft: "1.5",
});
