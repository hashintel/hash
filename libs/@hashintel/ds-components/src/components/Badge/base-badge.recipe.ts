import { css, cva } from "@hashintel/ds-helpers/css";

// The `position: relative` wrapper around the anchor (`children`), so the
// overlay overhangs the anchor's corner rather than the whole viewport.
export const baseBadgeWrapper = css({
  position: "relative",
  display: "inline-flex",
});

// Centres the overlay (`content`) on the chosen corner of the wrapper. It's a
// passive layer (pointer-events: none, inherited by `content`), so it never
// swallows clicks meant for the anchor it decorates.
export const baseBadgePosition = cva({
  base: {
    position: "absolute",
    display: "inline-flex",
    pointerEvents: "none",
  },
  variants: {
    position: {
      "top-left": { top: "0", left: "0", transform: "[translate(-50%, -50%)]" },
      "top-right": {
        top: "0",
        right: "0",
        transform: "[translate(50%, -50%)]",
      },
      "bottom-left": {
        bottom: "0",
        left: "0",
        transform: "[translate(-50%, 50%)]",
      },
      "bottom-right": {
        bottom: "0",
        right: "0",
        transform: "[translate(50%, 50%)]",
      },
    },
  },
  defaultVariants: {
    position: "top-right",
  },
});
