import { css } from "@hashintel/ds-helpers/css";

/**
 * Layering for the portalled positioner element. `!important` overrides the
 * `z-index: var(--z-index)` that Ark's positioner sets inline.
 */
export const positionerStyles = css({
  zIndex: "popover !important",
});

export const contentStyles = css({
  _open: {
    animationName: "popoverIn",
    animationDuration: "faster",
  },
  _closed: {
    animationName: "popoverOut",
    animationDuration: "faster",
  },
});
