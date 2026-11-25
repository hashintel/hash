import { css } from "@hashintel/ds-helpers/css";

export const fieldRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  fontSize: "xs",
});

export const fieldLabelStyle = css({
  flexShrink: 0,
  width: "[110px]",
  color: "neutral.fg.subtle",
  fontWeight: "medium",
});

export const fieldValueStyle = css({
  color: "neutral.s115",
  fontFamily: "mono",
  minWidth: "[0]",
  overflowWrap: "anywhere",
});
