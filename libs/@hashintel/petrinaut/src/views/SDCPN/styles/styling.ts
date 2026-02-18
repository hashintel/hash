import { css } from "@hashintel/ds-helpers/css";

export const nodeDimensions = {
  place: { width: 130, height: 130 },
  transition: { width: 160, height: 80 },
};

export const placeStyling = css({
  padding: "4",
  borderRadius: "[50%]",
  width: `[${nodeDimensions.place.width}px]`,
  height: `[${nodeDimensions.place.height}px]`,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "neutral.s10",
  border: "2px solid",
  borderColor: "neutral.s80",
  fontSize: "[15px]",
  boxSizing: "border-box",
  position: "relative",
  textAlign: "center",
  lineHeight: "[1.3]",
});

export const transitionStyling = css({
  padding: "4",
  borderRadius: "2xl",
  width: `[${nodeDimensions.transition.width}px]`,
  height: `[${nodeDimensions.transition.height}px]`,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  background: "neutral.s20",
  border: "2px solid",
  borderColor: "neutral.s80",
  fontSize: "[15px]",
  boxSizing: "border-box",
  position: "relative",
});

export const handleStyling = {
  background: "#6b7280",
  width: 10,
  height: 10,
  borderRadius: "50%",
  zIndex: 3,
};
