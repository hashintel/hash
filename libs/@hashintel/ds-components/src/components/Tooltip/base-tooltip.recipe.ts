import { css } from "@hashintel/ds-helpers/css";

export const triggerStyles = css({
  lineHeight: "[0]",

  "&:focus-visible": {
    outline: "[2px solid {colors.neutral.s30}]",
    outlineOffset: "[2px]",
    borderRadius: "md",
  },
});

export const positionerStyles = css({
  zIndex: "tooltip !important",
});
