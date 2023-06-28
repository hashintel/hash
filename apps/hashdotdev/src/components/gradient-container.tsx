import { Box } from "@mui/material";
import { BoxProps } from "@mui/system";
import { FunctionComponent } from "react";

import { NAV_HEIGHT } from "./navbar";

export const GradientContainer: FunctionComponent<BoxProps> = ({
  children,
  sx = [],
  ...props
}) => (
  <Box
    component="section"
    py={15}
    sx={[
      {
        position: "relative",
        "&:before": {
          position: "absolute",
          background:
            "linear-gradient(183deg, #CEE3E8 0%, rgba(206, 227, 232, 0.00) 100%)",
          width: "100%",
          height: 500,
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
          bottom: 222,
          left: 0,
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255, 1) 90%)",
        },
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  >
    {children}
  </Box>
);
