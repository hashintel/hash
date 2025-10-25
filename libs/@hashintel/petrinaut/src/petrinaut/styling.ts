import { customColors } from "@hashintel/design-system/theme";
import type { Theme } from "@mui/material";
import type { SystemStyleObject } from "@mui/system";

export const nodeDimensions = {
  place: { width: 130, height: 130 },
  transition: { width: 160, height: 80 },
};

export const placeStyling: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
}) => ({
  padding: 1.5,
  borderRadius: "50%",
  width: nodeDimensions.place.width,
  height: nodeDimensions.place.height,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: palette.gray[10],
  border: `2px solid ${palette.gray[50]}`,
  fontSize: 15,
  boxSizing: "border-box",
  position: "relative",
  textAlign: "center",
  lineHeight: 1.3,
});

export const transitionStyling: (theme: Theme) => SystemStyleObject<Theme> = ({
  palette,
}) => ({
  padding: 1.5,
  borderRadius: 2,
  width: nodeDimensions.transition.width,
  height: nodeDimensions.transition.height,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  background: palette.gray[20],
  border: `2px solid ${palette.gray[50]}`,
  fontSize: 15,
  boxSizing: "border-box",
  position: "relative",
});

export const handleStyling = {
  background: customColors.gray[60],
  width: 10,
  height: 10,
  borderRadius: "50%",
  zIndex: 3,
};
