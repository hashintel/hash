import { css } from "@hashintel/ds-helpers/css";

export const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "[100%]",
  paddingTop: "[4px]",
});

export const chartAreaStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
});

export const legendContainerStyle = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "[12px]",
  fontSize: "[11px]",
  color: "[#666]",
  paddingY: "3",
  paddingX: "3",
});

export const legendItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[4px]",
  cursor: "pointer",
  userSelect: "none",
  transition: "[opacity 0.15s ease]",
  _hover: {
    opacity: 1,
  },
});

export const legendColorStyle = css({
  width: "[10px]",
  height: "[10px]",
  borderRadius: "[2px]",
});

export const tooltipStyle = css({
  position: "absolute",
  pointerEvents: "none",
  backgroundColor: "[rgba(0, 0, 0, 0.85)]",
  color: "neutral.s00",
  padding: "[6px 10px]",
  borderRadius: "md",
  fontSize: "[11px]",
  lineHeight: "[1.4]",
  zIndex: "[1000]",
  whiteSpace: "nowrap",
  boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.25)]",
  display: "none",
});

export const tooltipLabelStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
});

export const tooltipDotStyle = css({
  width: "[8px]",
  height: "[8px]",
  borderRadius: "[50%]",
  flexShrink: "[0]",
});

export const tooltipValueStyle = css({
  fontWeight: "semibold",
  marginLeft: "[4px]",
});
