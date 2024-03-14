import { Box } from "@mui/material";
import type { BoxProps } from "@mui/system";
import type { FunctionComponent } from "react";

import { NAV_HEIGHT } from "./navbar";

const gradientHeight = 500;

export const GradientContainer: FunctionComponent<BoxProps> = ({
  children,
  ...props
}) => (
  <Box component="section" {...props}>
    <Box
      sx={{
        position: "absolute",
        width: "100%",
        top: 0,
        "&:before": {
          position: "absolute",
          background:
            "linear-gradient(183deg, #CEE3E8 0%, rgba(206, 227, 232, 0.00) 100%)",
          width: "100%",
          height: gradientHeight,
          top: -NAV_HEIGHT,
          zIndex: -2,
          content: `""`,
          display: "block",
          left: 0,
        },
        /** ensure the gradient fades out smoothly */
        "&:after": {
          content: `""`,
          position: "absolute",
          zIndex: -1,
          width: "100%",
          height: 100,
          bottom: -1 * (gradientHeight - NAV_HEIGHT),
          left: 0,
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255, 1) 90%)",
        },
      }}
    />
    {children}
  </Box>
);
