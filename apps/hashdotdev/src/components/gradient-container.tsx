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
            "linear-gradient(0deg, rgba(255,255,255,1) 0%, rgba(237,252,255,1) 53%)",
          width: "100%",
          height: 500,
          top: -NAV_HEIGHT,
          zIndex: -1,
          content: `""`,
          display: "block",
          left: 0,
        },
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
    {...props}
  >
    {children}
  </Box>
);
