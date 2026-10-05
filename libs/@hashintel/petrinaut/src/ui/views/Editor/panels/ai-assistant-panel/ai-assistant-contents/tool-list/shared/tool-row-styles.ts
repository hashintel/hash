import { css } from "@hashintel/ds-helpers/css";

export const toolListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

export const toolItemCollapsibleStyle = css({
  "& > button": {
    borderRadius: "[0]",
  },
});

export const toolTextStyle = css({
  display: "flex",
  flex: "[1]",
  flexDirection: "column",
  gap: "[2px]",
});

export const toolDetailStyle = css({
  display: "block",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "[16px]",
});

export const toolSubItemListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "[4px 8px 8px 30px]",
  color: "neutral.s80",
  fontSize: "xs",
  fontWeight: "medium",
  lineHeight: "[16px]",
});

export const toolSubItemStyle = css({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
