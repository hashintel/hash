import { css } from "@hashintel/ds-helpers/css";

export const briefLinkStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  h: "7",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "[#bfdbfe]",
  bg: "[#eff6ff]",
  px: "2.5",
  py: "1",
  textStyle: "xs",
  lineHeight: "none",
  fontWeight: "medium",
  color: "[#1d4ed8]",
  whiteSpace: "nowrap",
  _hover: { borderColor: "[#93c5fd]", bg: "[#dbeafe]", color: "[#1e40af]" },
});

export const neutralActionButtonStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1.5",
  h: "7",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  px: "2.5",
  py: "1",
  textStyle: "xs",
  lineHeight: "none",
  fontWeight: "medium",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export const neutralActionButtonToneStyle = css({
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
  color: "fg.muted",
  _hover: { borderColor: "bd.strong", color: "fg.heading" },
});
